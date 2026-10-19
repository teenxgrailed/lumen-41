import { SubscriptionPlan } from "@prisma/client";

import { getPlan } from "@/lib/entitlements";

import {
  type SuggestionCandidate,
  parseSuggestions,
  suggestHighlights,
  suggestionCandidatesSchema,
  suggestionPrompt,
} from "../highlight-suggestions";
import { getConfiguredSchedulerAI, getPreparedSchedulerAI } from "../settings";

jest.mock("@/lib/entitlements", () => ({ getPlan: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock("../settings", () => ({
  getConfiguredSchedulerAI: jest.fn(),
  getPreparedSchedulerAI: jest.fn(),
}));

const plan = getPlan as jest.Mock;
const configured = getConfiguredSchedulerAI as jest.Mock;
const prepared = getPreparedSchedulerAI as jest.Mock;

const DATE = "2026-10-19";
const CANDS: SuggestionCandidate[] = [
  {
    id: "a",
    title: "Create the look list",
    due: DATE,
    priority: "high",
    minutes: 60,
  },
  { id: "b", title: "German B1", due: "2026-10-18", focus: true },
  { id: "c", title: "List jackets", minutes: 45 },
];

const ai = (text: string) => ({
  ai: {
    async *streamChat() {
      yield text.slice(0, 12);
      yield text.slice(12);
    },
  },
  source: "hosted",
});

beforeEach(() => {
  jest.clearAllMocks();
  plan.mockResolvedValue(SubscriptionPlan.PRO);
  configured.mockResolvedValue({ source: "hosted" });
  prepared.mockResolvedValue(
    ai(
      '[{"id":"a","reason":"The drop is Friday."},{"id":"b","reason":"A week focus."}]'
    )
  );
});

describe("the words", () => {
  it("lists each task with what is known about it", () => {
    const p = suggestionPrompt(DATE, CANDS);
    expect(p).toContain(
      "- id a: Create the look list (due 2026-10-19, high priority, 60 min)"
    );
    expect(p).toContain(
      "- id b: German B1 (week focus, overdue since 2026-10-18)"
    );
    expect(p).toContain("- id c: List jackets (45 min)");
  });

  it("reads 1 to 12 candidates", () => {
    expect(suggestionCandidatesSchema.safeParse([]).success).toBe(false);
    expect(suggestionCandidatesSchema.safeParse(CANDS).success).toBe(true);
    const many = Array.from({ length: 13 }, (_, i) => ({
      id: `t${i}`,
      title: "x",
    }));
    expect(suggestionCandidatesSchema.safeParse(many).success).toBe(false);
  });
});

describe("parseSuggestions", () => {
  it("keeps offered ids once, with a one-line reason, at most three", () => {
    const raw =
      'Sure: [{"id":"a","reason":"First.\\nSecond"},{"id":"a","reason":"dup"},' +
      '{"id":"zzz","reason":"invented"},{"id":"b","reason":""},{"id":"c","reason":"Ok"},' +
      '{"id":"b","reason":"Late"}] done';
    expect(parseSuggestions(raw, CANDS)).toEqual([
      { taskId: "a", reason: "First. Second" },
      { taskId: "c", reason: "Ok" },
      { taskId: "b", reason: "Late" },
    ]);
  });

  it("gives nothing for prose or a broken array", () => {
    expect(parseSuggestions("no list here", CANDS)).toEqual([]);
    expect(parseSuggestions('[{"id":"a"', CANDS)).toEqual([]);
  });

  it("shortens a long reason", () => {
    const out = parseSuggestions(
      `[{"id":"a","reason":"${"x".repeat(300)}"}]`,
      CANDS
    );
    expect(out[0]?.reason.length).toBeLessThanOrEqual(100);
  });
});

describe("suggestHighlights", () => {
  it("answers the model's picks", async () => {
    const out = await suggestHighlights("u1", DATE, CANDS);
    expect(out).toEqual({
      status: "ready",
      suggestions: [
        { taskId: "a", reason: "The drop is Friday." },
        { taskId: "b", reason: "A week focus." },
      ],
    });
  });

  it("asks a Free account to upgrade and spends nothing", async () => {
    plan.mockResolvedValue(SubscriptionPlan.FREE);
    expect(await suggestHighlights("u1", DATE, CANDS)).toEqual({
      status: "upgrade",
      suggestions: [],
    });
    expect(prepared).not.toHaveBeenCalled();
  });

  it("is unavailable with no AI, when the allowance is spent, or on junk", async () => {
    configured.mockResolvedValue({ source: "none" });
    expect((await suggestHighlights("u1", DATE, CANDS)).status).toBe(
      "unavailable"
    );
    expect(prepared).not.toHaveBeenCalled();

    configured.mockResolvedValue({ source: "hosted" });
    prepared.mockResolvedValue({ ai: {}, source: "none" });
    expect((await suggestHighlights("u1", DATE, CANDS)).status).toBe(
      "unavailable"
    );

    prepared.mockResolvedValue(ai("I cannot choose."));
    expect((await suggestHighlights("u1", DATE, CANDS)).status).toBe(
      "unavailable"
    );

    prepared.mockRejectedValue(new Error("down"));
    expect((await suggestHighlights("u1", DATE, CANDS)).status).toBe(
      "unavailable"
    );
  });
});
