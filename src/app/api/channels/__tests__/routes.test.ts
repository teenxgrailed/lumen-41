import { NextRequest, NextResponse } from "next/server";

import { DELETE as deleteChannel } from "@/app/api/channels/[channel]/route";
import { POST as postLinkCode } from "@/app/api/channels/link-code/route";
import { GET as getChannels } from "@/app/api/channels/route";
import { POST as postWebhook } from "@/app/api/channels/telegram/webhook/route";
import { parseTasksForUser } from "@/services/ai/parse-tasks";
import { sendChannelTouch } from "@/services/channels";
import { createDayPlanDb } from "@/services/day-plan/__tests__/fake-db";
import { NOW, USER } from "@/services/day-plan/__tests__/helpers";

import { authenticateRequest } from "@/lib/auth/api-auth";

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
jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/security/rate-limit", () => ({
  enforceRateLimits: jest.fn().mockResolvedValue(null),
  accountRule: jest.fn(),
  ipRule: jest.fn(),
}));
jest.mock("@/lib/activation-events", () => ({ recordActivation: jest.fn() }));
jest.mock("@/services/ai/parse-tasks", () => ({
  parseTasksForUser: jest.fn(),
}));
jest.mock("@/lib/auth/personal-workspace", () => ({
  ensurePersonalWorkspaceRow: jest.fn().mockResolvedValue({ id: "ws-1" }),
}));

const auth = authenticateRequest as jest.Mock;
const parse = parseTasksForUser as jest.Mock;

const SECRET = "hook_secret_1";
const ENV_KEYS = [
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_WEBHOOK_SECRET",
  "TELEGRAM_BOT_USERNAME",
] as const;
const savedEnv: Record<string, string | undefined> = {};
const realFetch = global.fetch;
let fetchMock: jest.Mock;

const configure = () => {
  process.env.TELEGRAM_BOT_TOKEN = "bot-token";
  process.env.TELEGRAM_WEBHOOK_SECRET = SECRET;
  process.env.TELEGRAM_BOT_USERNAME = "needt_test_bot";
};

const webhook = (body: unknown, secret?: string) =>
  new NextRequest("http://localhost/api/channels/telegram/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(secret ? { "x-telegram-bot-api-secret-token": secret } : {}),
    },
    body: JSON.stringify(body),
  });

const api = (url: string, method = "GET", body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const update = (text: string, chat = 9001) => ({
  update_id: 1,
  message: { message_id: 1, chat: { id: chat, type: "private" }, text },
});

beforeEach(() => {
  mockState.db = createDayPlanDb();
  mockState.db.insert("userSettings", { userId: USER, timeZone: "UTC" });
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, result: {} }),
    arrayBuffer: async () => new ArrayBuffer(0),
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  parse.mockReset();
  parse.mockResolvedValue({ fallback: false, tasks: [{ title: "Buy milk" }] });
  auth.mockResolvedValue({ userId: USER });
});

afterEach(() => {
  global.fetch = realFetch;
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe("channel routes", () => {
  it("test_forged_webhook_is_rejected", async () => {
    configure();
    mockState.db.insert("channelLink", {
      userId: USER,
      channel: "telegram",
      externalChatId: "9001",
      linkedAt: NOW,
      unlinkedAt: null,
    });

    for (const forged of [undefined, "wrong-secret", `${SECRET}x`, ""]) {
      const res = await postWebhook(webhook(update("buy milk"), forged));
      expect(res.status).toBe(401);
    }
    // Nothing was read, created, deduped or sent.
    expect(mockState.db.tables.task).toHaveLength(0);
    expect(mockState.db.tables.channelUpdate).toHaveLength(0);
    expect(parse).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();

    // The same body with the secret is processed.
    const ok = await postWebhook(webhook(update("buy milk"), SECRET));
    expect(ok.status).toBe(200);
    expect(mockState.db.tables.task).toHaveLength(1);
  });

  it("test_channel_inert_without_token", async () => {
    // No bot secrets: the webhook is not there, nothing is sent, nothing is made.
    const res = await postWebhook(webhook(update("buy milk"), SECRET));
    expect(res.status).toBe(404);
    expect(mockState.db.tables.channelUpdate).toHaveLength(0);

    const touch = await sendChannelTouch(USER, {
      kind: "morning",
      text: "Plan",
      actions: [],
    });
    expect(touch).toBe(0);

    // One secret alone is still inert.
    process.env.TELEGRAM_BOT_TOKEN = "bot-token";
    expect((await postWebhook(webhook(update("hi"), SECRET))).status).toBe(404);
    delete process.env.TELEGRAM_BOT_TOKEN;

    // The link API says so, and the status list shows it.
    const code = await postLinkCode(
      api("/api/channels/link-code", "POST", { channel: "telegram" })
    );
    expect(code.status).toBe(503);
    expect((await code.json()).error).toBe("channel_not_configured");
    expect(mockState.db.tables.channelLinkCode).toHaveLength(0);

    const status = await (await getChannels(api("/api/channels"))).json();
    expect(status.channels).toEqual([
      { channel: "telegram", configured: false, linked: false },
    ]);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("hands out a link code and a deep link once the bot is configured", async () => {
    configure();
    const res = await postLinkCode(
      api("/api/channels/link-code", "POST", { channel: "telegram" })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.code).toMatch(/^[A-Za-z0-9_-]{16}$/);
    expect(body.deepLink).toBe(
      `https://t.me/needt_test_bot?start=${body.code}`
    );
    const minutes = (new Date(body.expiresAt).getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(9);
    expect(minutes).toBeLessThanOrEqual(10);
    expect(JSON.stringify(mockState.db.tables.channelLinkCode)).not.toContain(
      body.code
    );

    // The full circle: /start <code> from Telegram links the chat.
    const start = await postWebhook(
      webhook(update(`/start ${body.code}`), SECRET)
    );
    expect(start.status).toBe(200);
    expect(mockState.db.tables.channelLink).toHaveLength(1);
    expect(mockState.db.tables.channelLink[0].userId).toBe(USER);
  });

  it("rejects a bad channel and requires a session", async () => {
    configure();
    const bad = await postLinkCode(
      api("/api/channels/link-code", "POST", { channel: "fax" })
    );
    expect(bad.status).toBe(400);

    auth.mockResolvedValue({
      response: new NextResponse("Unauthorized", { status: 401 }),
    });
    expect((await getChannels(api("/api/channels"))).status).toBe(401);
    expect(
      (
        await postLinkCode(
          api("/api/channels/link-code", "POST", { channel: "telegram" })
        )
      ).status
    ).toBe(401);
    expect(
      (
        await deleteChannel(api("/api/channels/telegram", "DELETE"), {
          params: Promise.resolve({ channel: "telegram" }),
        })
      ).status
    ).toBe(401);
  });

  it("unlinks from Needt, also when the bot is not configured", async () => {
    mockState.db.insert("channelLink", {
      userId: USER,
      channel: "telegram",
      externalChatId: "9001",
      linkedAt: NOW,
      unlinkedAt: null,
    });
    const res = await deleteChannel(api("/api/channels/telegram", "DELETE"), {
      params: Promise.resolve({ channel: "telegram" }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).unlinked).toBe(1);
    expect(mockState.db.tables.channelLink[0].unlinkedAt).not.toBeNull();

    // Incoming messages from the chat are now treated as unlinked.
    configure();
    await postWebhook(webhook(update("buy milk"), SECRET));
    expect(mockState.db.tables.task).toHaveLength(0);

    const unknown = await deleteChannel(api("/api/channels/fax", "DELETE"), {
      params: Promise.resolve({ channel: "fax" }),
    });
    expect(unknown.status).toBe(404);
  });
});
