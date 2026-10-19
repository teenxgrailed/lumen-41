import { SubscriptionPlan } from "@prisma/client";

import { getPlan } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";

import {
  type BriefFacts,
  briefFactsSchema,
  briefPrompt,
  cleanBrief,
  dismissBrief,
  ensureBrief,
} from "../morning-brief";
import { getConfiguredSchedulerAI, getPreparedSchedulerAI } from "../settings";

jest.mock("@/lib/entitlements", () => ({ getPlan: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    morningBrief: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));
jest.mock("../settings", () => ({
  getConfiguredSchedulerAI: jest.fn(),
  getPreparedSchedulerAI: jest.fn(),
}));

const db = prisma.morningBrief as unknown as Record<string, jest.Mock>;
const plan = getPlan as jest.Mock;
const configured = getConfiguredSchedulerAI as jest.Mock;
const prepared = getPreparedSchedulerAI as jest.Mock;

const FACTS: BriefFacts = {
  today: ["Write report", "Call Anna"],
  openToday: 2,
  doneToday: 1,
  overdue: ["Pay rent"],
  overdueCount: 1,
  freeMinutes: 150,
  nextEvent: { title: "Planning", at: "10:00" },
};
const DATE = "2026-10-18";

function ai(text: string) {
  return {
    ai: {
      async *streamChat() {
        yield text.slice(0, 10);
        yield text.slice(10);
      },
    },
    source: "hosted",
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  plan.mockResolvedValue(SubscriptionPlan.PRO);
  configured.mockResolvedValue({ source: "hosted" });
  db.findUnique.mockResolvedValue(null);
  db.create.mockResolvedValue({});
  db.update.mockImplementation(({ data }) =>
    Promise.resolve({ date: DATE, text: data.text ?? "", dismissedAt: null })
  );
  db.deleteMany.mockResolvedValue({ count: 1 });
  prepared.mockResolvedValue(ai("Two tasks matter today.\nOne is overdue."));
});

describe("the words", () => {
  it("lists the facts for the model and says nothing is overdue", () => {
    const p = briefPrompt(FACTS);
    expect(p).toContain("Open today: 2; done today: 1.");
    expect(p).toContain("Overdue: 1 (Pay rent).");
    expect(p).toContain("Free working time left today: 2 h 30.");
    expect(p).toContain("Next event: Planning at 10:00.");
    expect(briefPrompt({ ...FACTS, overdueCount: 0, overdue: [] })).toContain(
      "Nothing is overdue."
    );
  });

  it("keeps two or three clean lines, without marks", () => {
    expect(cleanBrief("- One.\n\n* Two.\n3) Three.\nFour.")).toBe(
      "One.\nTwo.\nThree."
    );
    expect(cleanBrief("**Bold** `x`")).toBe("Bold x");
    expect(cleanBrief("   ")).toBe("");
    expect(cleanBrief("a".repeat(900)).length).toBeLessThanOrEqual(220);
  });

  it("keeps a leading count and drops only list marks", () => {
    expect(cleanBrief("14 tasks open today, none done yet.")).toBe(
      "14 tasks open today, none done yet."
    );
    expect(cleanBrief("1. 14 tasks open.")).toBe("14 tasks open.");
    expect(cleanBrief("2) 3 overdue.")).toBe("3 overdue.");
  });

  it("caps long text at a sentence end", () => {
    const text = `${"Word ".repeat(30).trim()}. Second sentence here. ${"More ".repeat(40)}`;
    const out = cleanBrief(text);
    expect(out.length).toBeLessThanOrEqual(220);
    expect(out.endsWith(".")).toBe(true);
    expect(out).toContain("Second sentence here.");
  });

  it("accepts the facts a client sends and refuses junk", () => {
    expect(briefFactsSchema.safeParse(FACTS).success).toBe(true);
    expect(
      briefFactsSchema.safeParse({ ...FACTS, openToday: -1 }).success
    ).toBe(false);
    expect(
      briefFactsSchema.safeParse({ ...FACTS, today: Array(9).fill("x") })
        .success
    ).toBe(false);
  });
});

describe("ensureBrief", () => {
  it("writes the brief once and caches it", async () => {
    const out = await ensureBrief("u1", DATE, FACTS);
    expect(out.status).toBe("ready");
    expect(out.brief?.text).toBe("Two tasks matter today.\nOne is overdue.");
    expect(db.create).toHaveBeenCalledWith({
      data: { userId: "u1", date: DATE, text: "" },
    });
    expect(prepared).toHaveBeenCalledTimes(1);
  });

  it("returns the cached brief without another AI action", async () => {
    db.findUnique.mockResolvedValue({
      date: DATE,
      text: "Cached.",
      dismissedAt: null,
      updatedAt: new Date(),
    });
    const out = await ensureBrief("u1", DATE, FACTS);
    expect(out).toMatchObject({ status: "ready", brief: { text: "Cached." } });
    expect(prepared).not.toHaveBeenCalled();
    expect(plan).not.toHaveBeenCalled();
  });

  it("keeps a dismissed brief cached, so it is not written again", async () => {
    db.findUnique.mockResolvedValue({
      date: DATE,
      text: "Cached.",
      dismissedAt: new Date(),
      updatedAt: new Date(),
    });
    const out = await ensureBrief("u1", DATE, FACTS);
    expect(out.brief?.dismissed).toBe(true);
    expect(prepared).not.toHaveBeenCalled();
  });

  it("writes nothing for a Free account", async () => {
    plan.mockResolvedValue(SubscriptionPlan.FREE);
    expect(await ensureBrief("u1", DATE, FACTS)).toEqual({
      status: "upgrade",
      brief: null,
    });
    expect(db.create).not.toHaveBeenCalled();
    expect(prepared).not.toHaveBeenCalled();
  });

  it("writes nothing when no AI can answer", async () => {
    configured.mockResolvedValue({ source: "none" });
    expect(await ensureBrief("u1", DATE, FACTS)).toEqual({
      status: "unavailable",
      brief: null,
    });
    expect(db.create).not.toHaveBeenCalled();
  });

  it("is pending while another request is writing, and does not call the AI", async () => {
    db.findUnique.mockResolvedValue({
      date: DATE,
      text: "",
      dismissedAt: null,
      updatedAt: new Date(),
    });
    expect((await ensureBrief("u1", DATE, FACTS)).status).toBe("pending");
    expect(prepared).not.toHaveBeenCalled();
  });

  it("loses a race to another request politely", async () => {
    db.create.mockRejectedValue(
      Object.assign(new Error("dup"), { code: "P2002" })
    );
    expect((await ensureBrief("u1", DATE, FACTS)).status).toBe("pending");
    expect(prepared).not.toHaveBeenCalled();
  });

  it("takes over a generation that died", async () => {
    db.findUnique.mockResolvedValue({
      id: "b1",
      date: DATE,
      text: "",
      dismissedAt: null,
      updatedAt: new Date(Date.now() - 10 * 60 * 1000),
    });
    expect((await ensureBrief("u1", DATE, FACTS)).status).toBe("ready");
    expect(prepared).toHaveBeenCalledTimes(1);
  });

  it("gives the day back when the AI is blocked or fails", async () => {
    prepared.mockResolvedValue({ ai: {}, source: "none" });
    expect((await ensureBrief("u1", DATE, FACTS)).status).toBe("unavailable");
    expect(db.deleteMany).toHaveBeenCalledWith({
      where: { userId: "u1", date: DATE, text: "" },
    });
    prepared.mockRejectedValue(new Error("down"));
    expect((await ensureBrief("u1", DATE, FACTS)).status).toBe("unavailable");
  });

  it("gives the day back when the model says nothing", async () => {
    prepared.mockResolvedValue(ai("   "));
    expect((await ensureBrief("u1", DATE, FACTS)).status).toBe("unavailable");
    expect(db.deleteMany).toHaveBeenCalled();
  });
});

describe("dismissBrief", () => {
  it("marks the day's brief dismissed", async () => {
    db.updateMany.mockResolvedValue({ count: 1 });
    expect(await dismissBrief("u1", DATE)).toBe(true);
    expect(db.updateMany.mock.calls[0][0].where).toEqual({
      userId: "u1",
      date: DATE,
    });
    db.updateMany.mockResolvedValue({ count: 0 });
    expect(await dismissBrief("u1", DATE)).toBe(false);
  });
});
