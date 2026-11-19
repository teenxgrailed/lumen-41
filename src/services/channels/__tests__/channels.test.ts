import { parseTasksForUser } from "@/services/ai/parse-tasks";
import { createDayPlanDb } from "@/services/day-plan/__tests__/fake-db";
import {
  NOW,
  OTHER,
  TODAY,
  TOMORROW,
  USER,
  dayDate,
  seedPlan,
  seedTask,
} from "@/services/day-plan/__tests__/helpers";
import { readFileSync } from "fs";
import { join } from "path";

import { recordActivation } from "@/lib/activation-events";
import { logger } from "@/lib/logger";

import { buildTouchMessage, handleIncoming } from "../core";
import { LINK_CODE_TTL_MS, createLinkCode, findActiveLink } from "../links";
import { SECRET_HEADER, createTelegramAdapter } from "../telegram/adapter";
import { type FetchLike, createTelegramClient } from "../telegram/client";
import { sendChannelTouch } from "../touch";
import type { Transcriber } from "../transcribe";
import type { ChannelAdapter, InboundUpdate, OutgoingMessage } from "../types";
import { processWebhook } from "../webhook";

const mockState = { db: createDayPlanDb() };

jest.mock("@/lib/prisma", () => ({
  get prisma() {
    return mockState.db.client;
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));
jest.mock("@/lib/activation-events", () => ({ recordActivation: jest.fn() }));
jest.mock("@/lib/security/rate-limit", () => ({
  enforceRateLimits: jest.fn().mockResolvedValue(null),
  accountRule: jest.fn(),
  ipRule: jest.fn(),
}));
jest.mock("@/services/ai/parse-tasks", () => ({
  parseTasksForUser: jest.fn(),
}));
jest.mock("@/lib/auth/personal-workspace", () => ({
  ensurePersonalWorkspaceRow: jest.fn().mockResolvedValue({ id: "ws-1" }),
}));

const parse = parseTasksForUser as jest.Mock;
const record = recordActivation as jest.Mock;
const db = () => mockState.db;

const SECRET = "hook_secret_1";
const CHAT = "5001";
const OTHER_CHAT = "5002";
const clock = { now: () => NOW };

/** A tiny stand-in for the AI/fallback parser: splits on commas and "and". */
function fakeParse() {
  parse.mockImplementation(async (_user: string, text: string) => ({
    fallback: false,
    tasks: text
      .replace(/^tomorrow\s+/i, "")
      .split(/,|\band\b|\n/)
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => ({ title: part[0].toUpperCase() + part.slice(1) })),
  }));
}

function telegramFetch() {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fetchMock: FetchLike = async (url, init) => {
    calls.push({ url, body: init?.body ? JSON.parse(init.body) : {} });
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, result: {} }),
      arrayBuffer: async () => new ArrayBuffer(0),
    };
  };
  return { fetchMock, calls };
}

function telegram() {
  const { fetchMock, calls } = telegramFetch();
  const adapter = createTelegramAdapter({
    client: createTelegramClient("bot-token", fetchMock),
    secret: SECRET,
  });
  return { adapter, calls };
}

const hook = (body: unknown, secret: string | null = SECRET) =>
  new Request("http://localhost/api/channels/telegram/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(secret ? { [SECRET_HEADER]: secret } : {}),
    },
    body: JSON.stringify(body),
  });

const textUpdate = (updateId: number, chat: string, text: string) => ({
  update_id: updateId,
  message: {
    message_id: updateId,
    chat: { id: Number(chat), type: "private" },
    text,
  },
});

const voiceUpdate = (updateId: number, chat: string) => ({
  update_id: updateId,
  message: {
    message_id: updateId,
    chat: { id: Number(chat), type: "private" },
    voice: { file_id: "voice-file-1" },
  },
});

const buttonUpdate = (updateId: number, chat: string, data: string) => ({
  update_id: updateId,
  callback_query: {
    id: `cb-${updateId}`,
    data,
    message: { message_id: 77, chat: { id: Number(chat), type: "private" } },
  },
});

function linkChat(userId: string, chat: string) {
  db().insert("channelLink", {
    userId,
    channel: "telegram",
    externalChatId: chat,
    linkedAt: NOW,
    unlinkedAt: null,
  });
}

const sentTexts = (calls: { body: Record<string, unknown> }[]) =>
  calls.map((c) => String(c.body.text ?? ""));

const taskTitles = (userId = USER) =>
  db()
    .tables.task.filter((t) => t.userId === userId)
    .map((t) => String(t.title));

beforeEach(() => {
  mockState.db = createDayPlanDb();
  db().insert("userSettings", { userId: USER, timeZone: "Europe/Zurich" });
  db().insert("userSettings", { userId: OTHER, timeZone: "Europe/Zurich" });
  parse.mockReset();
  record.mockReset();
  (logger.error as jest.Mock).mockClear();
  fakeParse();
});

describe("channel core", () => {
  it("test_core_does_not_know_the_messenger", async () => {
    // Source: nothing in the core files names a messenger or imports an adapter.
    for (const file of [
      "core.ts",
      "types.ts",
      "links.ts",
      "webhook.ts",
      "transcribe.ts",
    ]) {
      const source = readFileSync(join(__dirname, "..", file), "utf8");
      expect(source).not.toMatch(/telegram/i);
      expect(source).not.toMatch(/from\s+["']\.\/telegram/);
    }

    // Behaviour: a text event for a made-up channel answers with plain fields.
    db().insert("channelLink", {
      userId: USER,
      channel: "carrier-pigeon",
      externalChatId: "coop-1",
      linkedAt: NOW,
      unlinkedAt: null,
    });
    const answer = (await handleIncoming(
      {
        channel: "carrier-pigeon",
        externalChatId: "coop-1",
        event: { kind: "text", text: "buy milk" },
      },
      clock
    )) as OutgoingMessage;
    expect(Object.keys(answer).sort()).toEqual(["actions", "kind", "text"]);
    expect(answer.text).toContain("Buy milk");
  });

  it("test_same_reply_gives_same_tasks_on_any_channel", async () => {
    linkChat(USER, CHAT);
    db().insert("channelLink", {
      userId: OTHER,
      channel: "test-channel",
      externalChatId: "t-1",
      linkedAt: NOW,
      unlinkedAt: null,
    });
    const { adapter } = telegram();
    const sent: OutgoingMessage[] = [];
    const testAdapter: ChannelAdapter = {
      channel: "test-channel",
      verify: () => true,
      parseUpdate: async (): Promise<InboundUpdate> => ({
        externalUpdateId: "u-1",
        externalChatId: "t-1",
        event: { kind: "text", text: "call the landlord and send the invoice" },
      }),
      send: async (_target, message) => {
        sent.push(message);
      },
    };

    await processWebhook(
      adapter,
      hook(textUpdate(1, CHAT, "call the landlord and send the invoice")),
      clock
    );
    await processWebhook(testAdapter, hook({}), clock);

    const a = taskTitles(USER);
    const b = taskTitles(OTHER);
    expect(a).toEqual(["Call the landlord", "Send the invoice"]);
    expect(b).toEqual(a);
    expect(sent[0].text).toContain("Call the landlord");

    const plan = (userId: string) =>
      db().tables.dayPlan.find(
        (p) =>
          p.userId === userId &&
          (p.date as Date).getTime() === dayDate(TOMORROW).getTime()
      );
    expect(plan(USER)).toBeTruthy();
    expect(plan(OTHER)).toBeTruthy();
  });

  it("test_unlinked_chat_creates_no_tasks", async () => {
    const { adapter, calls } = telegram();
    await processWebhook(
      adapter,
      hook(textUpdate(1, OTHER_CHAT, "buy milk")),
      clock
    );

    expect(db().tables.task).toHaveLength(0);
    expect(db().tables.dayPlan).toHaveLength(0);
    expect(parse).not.toHaveBeenCalled();
    expect(sentTexts(calls)).toHaveLength(1);
    expect(sentTexts(calls)[0]).toMatch(/not linked/i);
    expect(record).not.toHaveBeenCalled();
  });

  it("test_link_code_expires_after_10_minutes", async () => {
    const stale = await createLinkCode(USER, "telegram", NOW);
    const late = new Date(NOW.getTime() + LINK_CODE_TTL_MS + 1);
    const refused = await handleIncoming(
      {
        channel: "telegram",
        externalChatId: CHAT,
        event: { kind: "link", code: stale.code },
      },
      { now: () => late }
    );
    expect(refused?.text).toMatch(/did not work/i);
    expect(await findActiveLink("telegram", CHAT)).toBeNull();

    const fresh = await createLinkCode(USER, "telegram", NOW);
    const inTime = new Date(NOW.getTime() + LINK_CODE_TTL_MS - 1000);
    const ok = await handleIncoming(
      {
        channel: "telegram",
        externalChatId: CHAT,
        event: { kind: "link", code: fresh.code },
      },
      { now: () => inTime }
    );
    expect(ok?.text).toMatch(/linked/i);
    expect((await findActiveLink("telegram", CHAT))?.userId).toBe(USER);

    // Single use: the same code does not link another chat.
    const reused = await handleIncoming(
      {
        channel: "telegram",
        externalChatId: OTHER_CHAT,
        event: { kind: "link", code: fresh.code },
      },
      { now: () => inTime }
    );
    expect(reused?.text).toMatch(/did not work/i);
    expect(await findActiveLink("telegram", OTHER_CHAT)).toBeNull();
  });

  it("links through /start <code> and unlinks with /stop", async () => {
    const { adapter, calls } = telegram();
    const { code } = await createLinkCode(USER, "telegram", NOW);
    await processWebhook(
      adapter,
      hook(textUpdate(1, CHAT, `/start ${code}`)),
      clock
    );
    expect(sentTexts(calls)[0]).toMatch(/linked/i);
    expect(await findActiveLink("telegram", CHAT)).not.toBeNull();
    // The code is stored as a hash, never as typed.
    expect(JSON.stringify(db().tables.channelLinkCode)).not.toContain(code);

    await processWebhook(adapter, hook(textUpdate(2, CHAT, "/stop")), clock);
    expect(await findActiveLink("telegram", CHAT)).toBeNull();

    // After unlinking the chat is a stranger again.
    await processWebhook(adapter, hook(textUpdate(3, CHAT, "buy milk")), clock);
    expect(db().tables.task).toHaveLength(0);
    expect(sentTexts(calls).at(-1)).toMatch(/not linked/i);
  });

  it("refuses a chat that already belongs to another account", async () => {
    linkChat(OTHER, CHAT);
    const { code } = await createLinkCode(USER, "telegram", NOW);
    const answer = await handleIncoming(
      {
        channel: "telegram",
        externalChatId: CHAT,
        event: { kind: "link", code },
      },
      clock
    );
    expect(answer?.text).toMatch(/another Needt account/i);
    expect((await findActiveLink("telegram", CHAT))?.userId).toBe(OTHER);
  });
});

describe("plan buttons", () => {
  it("test_done_button_completes_task", async () => {
    linkChat(USER, CHAT);
    const anna = seedTask(db(), { title: "Call Anna" });
    const gym = seedTask(db(), { title: "Gym" });
    seedPlan(db(), TODAY, [anna.id, gym.id], { status: "active" });
    const { adapter, calls } = telegram();

    await processWebhook(
      adapter,
      hook(buttonUpdate(1, CHAT, `d:${anna.id}`)),
      clock
    );

    const row = db().tables.task.find((t) => t.id === anna.id);
    expect(row?.status).toBe("completed");
    expect(row?.completedAt).toEqual(NOW);
    const edit = calls.find((c) => c.url.endsWith("/editMessageText"));
    expect(edit?.body.message_id).toBe(77);
    expect(String(edit?.body.text)).toContain("✓ Call Anna");
    expect(String(edit?.body.text)).toContain("Gym");
    expect(calls.some((c) => c.url.endsWith("/answerCallbackQuery"))).toBe(
      true
    );
    expect(record).toHaveBeenCalledWith("channel_reply", USER, {
      channel: "telegram",
      kind: "button",
      tasksCreated: 0,
    });
  });

  it("test_later_button_moves_task_to_someday", async () => {
    linkChat(USER, CHAT);
    const anna = seedTask(db(), { title: "Call Anna" });
    const gym = seedTask(db(), { title: "Gym" });
    seedPlan(db(), TODAY, [anna.id, gym.id], { status: "active" });
    const { adapter, calls } = telegram();

    await processWebhook(
      adapter,
      hook(buttonUpdate(1, CHAT, `l:${gym.id}`)),
      clock
    );

    const row = db().tables.task.find((t) => t.id === gym.id);
    expect(row?.somedayAt).toEqual(NOW);
    expect(row?.somedayReason).toBe("button");
    expect(row?.status).toBe("todo");
    // It left the plan, the other task stayed.
    expect(db().tables.dayPlanItem.map((i) => i.taskId)).toEqual([anna.id]);
    const edit = calls.find((c) => c.url.endsWith("/editMessageText"));
    expect(String(edit?.body.text)).not.toContain("Gym");
    expect(record).toHaveBeenCalledWith("task_to_someday", USER, {
      reason: "button",
    });
  });

  it("answers a stale button without changing anything", async () => {
    linkChat(USER, CHAT);
    const old = seedTask(db(), { title: "Old thing" });
    const gone = seedTask(db(), { title: "Deleted thing", trashedAt: NOW });
    seedPlan(db(), "2026-11-18", [old.id], { status: "closed" });
    seedPlan(db(), TODAY, [gone.id], { status: "active" });
    const { adapter, calls } = telegram();

    await processWebhook(
      adapter,
      hook(buttonUpdate(1, CHAT, `d:${old.id}`)),
      clock
    );
    await processWebhook(
      adapter,
      hook(buttonUpdate(2, CHAT, `d:${gone.id}`)),
      clock
    );

    expect(db().tables.task.find((t) => t.id === old.id)?.status).toBe("todo");
    expect(db().tables.task.find((t) => t.id === gone.id)?.status).toBe("todo");
    expect(
      sentTexts(calls).filter((t) => /no longer in the plan/.test(t))
    ).toHaveLength(2);
    expect(calls.some((c) => c.url.endsWith("/editMessageText"))).toBe(false);
  });

  it("will not touch another person's task", async () => {
    linkChat(USER, CHAT);
    const theirs = seedTask(db(), { title: "Theirs", userId: OTHER });
    seedPlan(db(), TODAY, [theirs.id], { status: "active" }, OTHER);
    const { adapter } = telegram();
    await processWebhook(
      adapter,
      hook(buttonUpdate(1, CHAT, `d:${theirs.id}`)),
      clock
    );
    expect(db().tables.task.find((t) => t.id === theirs.id)?.status).toBe(
      "todo"
    );
  });
});

describe("text and voice replies", () => {
  const evening = (userId = USER) => {
    const t = seedTask(db(), { title: "Open task", userId });
    seedPlan(db(), TODAY, [t.id], { status: "active" }, userId);
  };

  it("test_voice_reply_creates_tasks_for_tomorrow", async () => {
    linkChat(USER, CHAT);
    evening();
    const loaded: string[] = [];
    const transcriber: Transcriber = {
      async transcribe(audio) {
        const payload = await audio.load();
        loaded.push(String(payload?.bytes.length));
        return { text: "tomorrow call the landlord and send the invoice" };
      },
    };
    const { adapter, calls } = telegram();
    // The adapter would download the file; serve a small payload instead.
    const withAudio: ChannelAdapter = {
      ...adapter,
      loadVoice: async () => ({
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: "audio/ogg",
      }),
    };

    await processWebhook(withAudio, hook(voiceUpdate(1, CHAT)), {
      ...clock,
      transcriber,
    });

    expect(loaded).toEqual(["3"]);
    const plan = db().tables.dayPlan.find(
      (p) => (p.date as Date).getTime() === dayDate(TOMORROW).getTime()
    );
    expect(plan).toBeTruthy();
    const items = db().tables.dayPlanItem.filter((i) => i.planId === plan?.id);
    const titles = items.map(
      (i) => db().tables.task.find((t) => t.id === i.taskId)?.title
    );
    expect(titles).toEqual(["Call the landlord", "Send the invoice"]);
    const reply = sentTexts(calls)[0];
    expect(reply).toContain("Call the landlord");
    expect(reply).toContain("Send the invoice");
    expect(record).toHaveBeenCalledWith("channel_reply", USER, {
      channel: "telegram",
      kind: "voice",
      tasksCreated: 2,
    });
  });

  it("test_voice_without_provider_asks_for_text", async () => {
    linkChat(USER, CHAT);
    evening();
    const loadVoice = jest.fn();
    const { adapter, calls } = telegram();
    await processWebhook(
      { ...adapter, loadVoice },
      hook(voiceUpdate(1, CHAT)),
      clock
    );

    expect(loadVoice).not.toHaveBeenCalled();
    expect(parse).not.toHaveBeenCalled();
    expect(taskTitles()).toEqual(["Open task"]);
    expect(sentTexts(calls)[0]).toMatch(/as text/i);
    expect(record).toHaveBeenCalledWith("channel_reply", USER, {
      channel: "telegram",
      kind: "voice",
      tasksCreated: 0,
    });
  });

  it("asks for text when the transcript is empty", async () => {
    linkChat(USER, CHAT);
    const { adapter, calls } = telegram();
    await processWebhook(adapter, hook(voiceUpdate(1, CHAT)), {
      ...clock,
      transcriber: { transcribe: async () => ({ text: "  " }) },
    });
    expect(taskTitles()).toEqual([]);
    expect(sentTexts(calls)[0]).toMatch(/as text/i);
  });

  it("test_duplicate_update_creates_tasks_once", async () => {
    linkChat(USER, CHAT);
    const { adapter, calls } = telegram();
    const body = textUpdate(42, CHAT, "write report, book flights");

    const first = await processWebhook(adapter, hook(body), clock);
    const second = await processWebhook(adapter, hook(body), clock);

    expect(first.body.duplicate).toBeUndefined();
    expect(second.body.duplicate).toBe(true);
    expect(taskTitles()).toEqual(["Write report", "Book flights"]);
    expect(parse).toHaveBeenCalledTimes(1);
    expect(sentTexts(calls)).toHaveLength(1);
    expect(db().tables.channelUpdate).toHaveLength(1);
  });

  it("slows down once when a person floods the bot, then stays quiet", async () => {
    linkChat(USER, CHAT);
    const seen = new Map<string, number>();
    const allow = async (key: string, limit: number) => {
      const n = (seen.get(key) ?? 0) + 1;
      seen.set(key, n);
      return n <= limit;
    };
    const replies: (string | null)[] = [];
    for (let i = 0; i < 24; i += 1) {
      const out = await handleIncoming(
        {
          channel: "telegram",
          externalChatId: CHAT,
          event: { kind: "text", text: `task ${i}` },
        },
        { ...clock, allow }
      );
      replies.push(out?.text ?? null);
    }
    // 20 handled, then one "too fast" notice, then silence.
    expect(
      replies.slice(0, 20).every((r) => /^(Added|Saved)/.test(r ?? ""))
    ).toBe(true);
    expect(replies[20]).toMatch(/too fast/i);
    expect(replies.slice(21)).toEqual([null, null, null]);
    expect(taskTitles()).toHaveLength(20);
  });

  it("never logs message text", async () => {
    linkChat(USER, CHAT);
    parse.mockRejectedValue(new Error("parser down"));
    const { adapter } = telegram();
    await processWebhook(
      adapter,
      hook(textUpdate(1, CHAT, "secret plan about Anna")),
      clock
    );
    const logged = JSON.stringify(
      [logger.error, logger.warn, logger.info, logger.debug].flatMap(
        (fn) => (fn as jest.Mock).mock.calls
      )
    );
    expect(logged).not.toContain("secret plan");
    expect((logger.error as jest.Mock).mock.calls.length).toBeGreaterThan(0);
  });
});

describe("daily touches", () => {
  it("builds the morning plan and the evening review with done and later actions", async () => {
    const a = seedTask(db(), { title: "Call Anna" });
    const b = seedTask(db(), { title: "Gym", status: "completed" });
    seedPlan(db(), TODAY, [a.id, b.id], { status: "active" });

    const morning = await buildTouchMessage(USER, "morning", NOW);
    expect(morning.kind).toBe("morning");
    expect(morning.text).toContain("Call Anna");
    expect(morning.text).toContain("✓ Gym");
    expect(morning.actions.map((x) => `${x.taskId}:${x.action}`)).toEqual([
      `${a.id}:done`,
      `${a.id}:later`,
    ]);

    const eveningMessage = await buildTouchMessage(USER, "evening", NOW);
    expect(eveningMessage.kind).toBe("evening");
    expect(eveningMessage.text).toMatch(/tomorrow/i);
  });

  it("sends a touch to every active link and skips unlinked chats", async () => {
    linkChat(USER, CHAT);
    db().insert("channelLink", {
      userId: USER,
      channel: "telegram",
      externalChatId: "old",
      linkedAt: NOW,
      unlinkedAt: NOW,
    });
    linkChat(OTHER, OTHER_CHAT);
    const { adapter, calls } = telegram();
    const message: OutgoingMessage = {
      kind: "morning",
      text: "Plan for today",
      actions: [],
    };
    expect(await sendChannelTouch(USER, message, [adapter])).toBe(1);
    expect(calls).toHaveLength(1);
    expect(calls[0].body.chat_id).toBe(CHAT);
  });
});
