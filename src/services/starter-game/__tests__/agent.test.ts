import {
  getConfiguredSchedulerAI,
  getPreparedSchedulerAI,
} from "@/services/ai/settings";

import { canUseAiAgent } from "@/lib/entitlements";
import { STARTER_TILES_MAX } from "@/lib/starter-game";

import {
  cleanItem,
  makeStarterPlan,
  parseStarterReply,
  starterPrompt,
} from "../agent";

jest.mock("@/lib/entitlements", () => ({ canUseAiAgent: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/services/ops/helpers", () => ({
  userTimeZone: jest.fn().mockResolvedValue("Europe/Zurich"),
}));
jest.mock("@/services/ai/settings", () => ({
  getConfiguredSchedulerAI: jest.fn(),
  getPreparedSchedulerAI: jest.fn(),
}));

const allowed = canUseAiAgent as jest.Mock;
const configured = getConfiguredSchedulerAI as jest.Mock;
const prepared = getPreparedSchedulerAI as jest.Mock;

const ANSWERS = {
  do: "Shop / resale, Study",
  burn: "Drop on Friday, German homework for Wednesday",
  reg: "Duolingo daily, Lift 3× a week",
};

/** A reply of `n` tiles, plus one extra for every lane. */
function reply(n = 14) {
  const items = Array.from({ length: n }, (_, i) =>
    i < 8
      ? {
          title: `Task ${i}`,
          kind: "task",
          suggestedGroup: i % 2 ? "today" : "week",
          durationMinutes: 30,
        }
      : i < 11
        ? {
            title: `Habit ${i}`,
            kind: "habit",
            suggestedGroup: "habit",
            perWeek: 3,
          }
        : {
            title: `Project ${i}`,
            kind: "project",
            suggestedGroup: "project",
            horizon: "this quarter",
            firstStep: "Start it",
          }
  );
  const suggestions = {
    today: {
      title: "Pack orders",
      suggestedGroup: "today",
      durationMinutes: 25,
    },
    week: { title: "Plan posts", suggestedGroup: "week", durationMinutes: 30 },
    habit: { title: "Read 20 pages", suggestedGroup: "habit", perWeek: 7 },
    project: {
      title: "Autumn stock",
      suggestedGroup: "project",
      firstStep: "List what is left",
    },
  };
  return JSON.stringify({ items, suggestions });
}

function ai(text: string) {
  const streamChat = jest.fn(async function* (...args: unknown[]) {
    void args;
    yield text.slice(0, 20);
    yield text.slice(20);
  });
  return { streamChat, ai: { streamChat } };
}

beforeEach(() => {
  jest.clearAllMocks();
  allowed.mockResolvedValue({ allowed: true });
  configured.mockResolvedValue({ source: "hosted" });
});

describe("makeStarterPlan", () => {
  it("makes ONE request and returns the tiles with a suggestion per lane", async () => {
    const mock = ai(reply());
    prepared.mockResolvedValue({ ai: mock.ai, source: "hosted" });

    const out = await makeStarterPlan({ userId: "u1", answers: ANSWERS });

    expect(out.status).toBe("ready");
    expect(out.items).toHaveLength(14);
    expect(Object.keys(out.suggestions).sort()).toEqual([
      "habit",
      "project",
      "today",
      "week",
    ]);
    // one claim of the AI path, one stream: one action
    expect(prepared).toHaveBeenCalledTimes(1);
    expect(mock.streamChat).toHaveBeenCalledTimes(1);
  });

  it("sends the answers and the day to the model", async () => {
    const mock = ai(reply());
    prepared.mockResolvedValue({ ai: mock.ai, source: "hosted" });
    await makeStarterPlan({ userId: "u1", answers: ANSWERS });
    const request = mock.streamChat.mock.calls[0][0] as {
      messages: Array<{ content: string }>;
    };
    expect(request.messages[0].content).toContain("Drop on Friday");
    expect(request.messages[0].content).toMatch(
      /Today is \w+ \d{4}-\d{2}-\d{2}/
    );
  });

  it("is not made for a Free account and spends no action", async () => {
    allowed.mockResolvedValue({ allowed: false });
    const out = await makeStarterPlan({ userId: "u1", answers: ANSWERS });
    expect(out).toEqual({ status: "upgrade", items: [], suggestions: {} });
    expect(configured).not.toHaveBeenCalled();
    expect(prepared).not.toHaveBeenCalled();
  });

  it("says unavailable, and makes nothing up, when no AI can answer", async () => {
    configured.mockResolvedValue({ source: "none" });
    const out = await makeStarterPlan({ userId: "u1", answers: ANSWERS });
    expect(out.status).toBe("unavailable");
    expect(out.items).toEqual([]);
    expect(prepared).not.toHaveBeenCalled();

    configured.mockResolvedValue({ source: "hosted" });
    prepared.mockResolvedValue({ ai: {}, source: "none" });
    expect(
      (await makeStarterPlan({ userId: "u1", answers: ANSWERS })).status
    ).toBe("unavailable");
  });

  it("says unavailable on a reply that is not JSON, or on a provider error", async () => {
    prepared.mockResolvedValue({
      ai: ai("Sorry, I cannot.").ai,
      source: "hosted",
    });
    expect(
      (await makeStarterPlan({ userId: "u1", answers: ANSWERS })).status
    ).toBe("unavailable");

    prepared.mockResolvedValue({
      ai: {
        async *streamChat() {
          throw new Error("503");
        },
      },
      source: "hosted",
    });
    expect(
      (await makeStarterPlan({ userId: "u1", answers: ANSWERS })).status
    ).toBe("unavailable");
  });
});

describe("parseStarterReply", () => {
  it("reads JSON inside a code fence", () => {
    const parsed = parseStarterReply("```json\n" + reply(12) + "\n```");
    expect(parsed?.items).toHaveLength(12);
  });

  it("keeps at most 16 tiles and drops duplicates", () => {
    const many = JSON.stringify({
      items: Array.from({ length: 30 }, (_, i) => ({
        title: `T${i % 25}`,
        suggestedGroup: "week",
        durationMinutes: 30,
      })),
    });
    const parsed = parseStarterReply(many);
    expect(parsed?.items).toHaveLength(STARTER_TILES_MAX);
    expect(new Set(parsed?.items.map((i) => i.title)).size).toBe(16);
  });

  it("rejects a reply with too few usable tiles", () => {
    expect(
      parseStarterReply(
        JSON.stringify({ items: [{ title: "One", suggestedGroup: "week" }] })
      )
    ).toBeNull();
    expect(parseStarterReply("no json here")).toBeNull();
  });

  it("does not let an extra repeat a tile", () => {
    const parsed = parseStarterReply(
      JSON.stringify({
        items: Array.from({ length: 5 }, (_, i) => ({
          title: `T${i}`,
          suggestedGroup: "week",
        })),
        suggestions: { week: { title: "t0" }, today: { title: "New one" } },
      })
    );
    expect(parsed?.suggestions.week).toBeUndefined();
    expect(parsed?.suggestions.today?.title).toBe("New one");
  });
});

describe("cleanItem", () => {
  it("lets the lane decide the kind", () => {
    expect(
      cleanItem({
        title: "Run",
        suggestedGroup: "habit",
        kind: "task",
        perWeek: 3,
      })
    ).toMatchObject({ kind: "habit", perWeek: 3 });
  });

  it("drops a bad optional field and keeps the tile", () => {
    expect(
      cleanItem({
        title: "Call",
        suggestedGroup: "today",
        durationMinutes: 99999,
        dueDay: "tomorrow",
      })
    ).toEqual({ title: "Call", kind: "task", suggestedGroup: "today" });
  });

  it("turns a project without a first step into a task", () => {
    expect(
      cleanItem({ title: "Big thing", suggestedGroup: "project" })
    ).toMatchObject({ kind: "task", suggestedGroup: "week" });
  });

  it("refuses a tile without a title or a known lane", () => {
    expect(cleanItem({ suggestedGroup: "today" })).toBeNull();
    expect(cleanItem({ title: "X", suggestedGroup: "later" })).toBeNull();
    expect(cleanItem(null)).toBeNull();
  });
});

describe("starterPrompt", () => {
  it("marks what was not said", () => {
    const text = starterPrompt({
      answers: { do: "", burn: "x", reg: "" },
      today: "2026-10-19",
      weekday: "Monday",
      timeZone: "Europe/Zurich",
    });
    expect(text).toContain("(not said)");
    expect(text).toContain("Monday 2026-10-19");
  });
});
