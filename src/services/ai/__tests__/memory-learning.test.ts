import type { WorkspaceAccess } from "@/lib/auth/workspace-auth";
import { prisma } from "@/lib/prisma";

import {
  getLearnedSkips,
  isLearningEnabled,
  rememberForUser,
  upsertKeyedMemory,
} from "../memory";
import {
  buildContentExcerpt,
  computeWorkHabits,
  extractContentMemories,
  habitMemories,
  parseExtractedFacts,
  refreshHabitMemories,
  runLearning,
} from "../memory-learning";
import { getPreparedSchedulerAI } from "../settings";

jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    task: { findMany: jest.fn() },
    page: { findMany: jest.fn() },
    mailMessage: { findMany: jest.fn() },
    userSettings: { findUnique: jest.fn(), updateMany: jest.fn() },
    agentMemory: { deleteMany: jest.fn() },
  },
}));
jest.mock("@/services/pages/page-model", () => ({
  pageActorScope: jest.fn(() => ({ workspaceId: "ws-1" })),
}));
jest.mock("../memory", () => ({
  ...jest.requireActual("../memory"),
  isLearningEnabled: jest.fn(),
  getLearnedSkips: jest.fn(async () => []),
  rememberForUser: jest.fn(),
  upsertKeyedMemory: jest.fn(),
}));
jest.mock("../settings", () => ({ getPreparedSchedulerAI: jest.fn() }));

type TestPage = {
  id: string;
  parentId: string | null;
  isPrivate: boolean;
  title: string;
  blocks: Array<{ content: { text: string } }>;
};
let mockPages: TestPage[] = [];
// Every page that exists, including a private one the content query skips.
const treePages: TestPage[] = [
  { id: "p1", parentId: null, isPrivate: false, title: "", blocks: [] },
  { id: "journal", parentId: null, isPrivate: true, title: "", blocks: [] },
  { id: "daily", parentId: "journal", isPrivate: false, title: "", blocks: [] },
  { id: "nested", parentId: "daily", isPrivate: false, title: "", blocks: [] },
];

const enabled = isLearningEnabled as jest.Mock;
const prepared = getPreparedSchedulerAI as jest.Mock;
const workspace = { workspaceId: "ws-1" } as WorkspaceAccess;

const at = (iso: string, over: Record<string, unknown> = {}) => ({
  completedAt: new Date(iso),
  actualMinutes: 60,
  estimatedMinutes: 30,
  duration: null,
  ...over,
});

function ai(text: string) {
  return {
    ai: {
      async *streamChat() {
        yield text;
      },
    },
    source: "hosted",
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  enabled.mockResolvedValue(true);
  // Page rows the content query returns; a query by id answers with their
  // place in the tree, the way the private-tree check asks for it.
  mockPages = [
    {
      id: "p1",
      parentId: null,
      isPrivate: false,
      title: "Weekly plan",
      blocks: [{ content: { text: "Gym every Tuesday morning" } }],
    },
  ];
  (prisma.page.findMany as jest.Mock).mockImplementation(
    async (args: { where?: { id?: { in?: string[] } } }) =>
      args.where?.id?.in
        ? treePages.filter((page) => args.where!.id!.in!.includes(page.id))
        : mockPages
  );
  (prisma.mailMessage.findMany as jest.Mock).mockResolvedValue([
    {
      subject: "German course: lesson 4",
      fromName: "Sprachschule",
      fromAddress: "hi@sprach.de",
    },
  ]);
});

describe("computeWorkHabits", () => {
  it("finds the three hours in which focused work usually gets finished", () => {
    const tasks = [
      ...Array.from({ length: 7 }, (_, i) =>
        at(`2026-09-0${i + 1}T10:${10 + i}:00Z`)
      ),
      at("2026-09-09T15:00:00Z"),
      at("2026-09-10T16:00:00Z"),
    ];
    const { peak } = computeWorkHabits(tasks, "UTC");
    expect(peak).toEqual({ startHour: 8, endHour: 11, samples: 9 });
    expect(
      habitMemories({ peak, ratio: null, heavyDays: null })[0]
    ).toMatchObject({
      sourceKey: "habit:peak-hours",
      content: "Usually finishes focused work between 08:00 and 11:00.",
    });
  });

  it("reads the hour in the person's own time zone", () => {
    const tasks = Array.from({ length: 8 }, (_, i) =>
      at(`2026-09-0${i + 1}T08:30:00Z`)
    );
    // 08:30 UTC is 10:30 in Berlin in September
    expect(computeWorkHabits(tasks, "Europe/Berlin").peak?.startHour).toBe(8);
    expect(computeWorkHabits(tasks, "UTC").peak?.startHour).toBe(6);
  });

  it("says nothing from too few finished tasks", () => {
    const habits = computeWorkHabits(
      [at("2026-09-01T10:00:00Z"), at("2026-09-02T10:00:00Z")],
      "UTC"
    );
    expect(habits).toEqual({ peak: null, ratio: null, heavyDays: null });
  });

  it("compares real time with the estimate by the median", () => {
    const tasks = [60, 60, 60, 30, 90, 600].map((actual, i) =>
      at(`2026-09-0${i + 1}T10:00:00Z`, {
        actualMinutes: actual,
        estimatedMinutes: 30,
      })
    );
    const { ratio } = computeWorkHabits(tasks, "UTC");
    expect(ratio).toEqual({ ratio: 2, samples: 6 });
    const line = habitMemories({ peak: null, ratio, heavyDays: null })[0];
    expect(line.sourceKey).toBe("habit:duration-ratio");
    expect(line.data).toEqual({ ratio: 2, samples: 6 });
  });

  it("keeps no ratio line when estimates are about right", () => {
    expect(
      habitMemories({
        peak: null,
        ratio: { ratio: 1.04, samples: 12 },
        heavyDays: null,
      })
    ).toEqual([]);
  });

  it("names the heavy weekdays", () => {
    // 2026-09-01 is a Tuesday, 2026-09-03 a Thursday
    const tasks = [
      ...["01", "08", "15", "22"].map((d) => at(`2026-09-${d}T10:00:00Z`)),
      ...["03", "10", "17", "24"].map((d) => at(`2026-09-${d}T10:00:00Z`)),
      at("2026-09-04T10:00:00Z"),
      at("2026-09-12T10:00:00Z"),
    ];
    const { heavyDays } = computeWorkHabits(tasks, "UTC");
    expect(heavyDays?.days).toEqual([2, 4]);
    expect(
      habitMemories({ peak: null, ratio: null, heavyDays })[0].content
    ).toBe("Heaviest weekdays: Tuesday and Thursday.");
  });
});

describe("parseExtractedFacts", () => {
  it("keeps short facts, drops sensitive, repeated and malformed ones, and caps at 5", () => {
    const raw = `Here you go: ${JSON.stringify([
      {
        kind: "preference",
        from: "document",
        content: "Gym on Tuesday mornings",
      },
      { kind: "fact", from: "mail", content: "Takes a German course" },
      { kind: "fact", from: "mail", content: "takes a german course" },
      { kind: "fact", from: "mail", content: "Bank password is hunter2" },
      { kind: "weird", from: "elsewhere", content: "Writes a weekly plan" },
      { kind: "fact", content: "x" },
      ...Array.from({ length: 8 }, (_, i) => ({
        kind: "fact",
        from: "document",
        content: `Extra fact number ${i}`,
      })),
    ])} done`;
    const facts = parseExtractedFacts(raw);
    expect(facts).toHaveLength(5);
    expect(facts.map((f) => f.content).slice(0, 3)).toEqual([
      "Gym on Tuesday mornings",
      "Takes a German course",
      "Writes a weekly plan",
    ]);
    expect(facts[2]).toMatchObject({ kind: "fact", from: "document" });
  });

  it("returns nothing for prose or broken JSON", () => {
    expect(parseExtractedFacts("Nothing to add.")).toEqual([]);
    expect(parseExtractedFacts("[{broken")).toEqual([]);
  });
});

describe("extraction from documents and mail metadata", () => {
  it("sends subjects and senders only, never mail bodies or snippets", async () => {
    const excerpt = await buildContentExcerpt("user-1", workspace);
    expect(excerpt).toContain("Gym every Tuesday morning");
    expect(excerpt).toContain("German course: lesson 4 (Sprachschule)");
    const select = (prisma.mailMessage.findMany as jest.Mock).mock.calls[0][0]
      .select;
    expect(select).toEqual({
      subject: true,
      fromName: true,
      fromAddress: true,
    });
    const where = (prisma.mailMessage.findMany as jest.Mock).mock.calls[0][0]
      .where;
    expect(where.account).toEqual({ userId: "user-1" });
    expect(where.trashedAt).toBeNull();
    expect(
      (prisma.page.findMany as jest.Mock).mock.calls[0][0].where
    ).toMatchObject({ isPrivate: false, trashedAt: null });
  });

  it("leaves out a page anywhere under a private page, not just a direct child", async () => {
    mockPages = [
      ...mockPages,
      {
        id: "nested",
        parentId: "daily",
        isPrivate: false,
        title: "Therapy notes",
        blocks: [{ content: { text: "Private grandchild text" } }],
      },
    ];
    const excerpt = await buildContentExcerpt("user-1", workspace);
    expect(excerpt).toContain("Gym every Tuesday morning");
    expect(excerpt).not.toContain("Therapy notes");
    expect(excerpt).not.toContain("Private grandchild text");
  });

  it("saves what the mocked model returns, as document and mail memories", async () => {
    prepared.mockResolvedValue(
      ai(
        JSON.stringify([
          {
            kind: "pattern",
            from: "document",
            content: "Gym on Tuesday mornings",
          },
          { kind: "fact", from: "mail", content: "Takes a German course" },
          { kind: "fact", from: "mail", content: "Credit card ends 4242" },
        ])
      )
    );
    expect(await extractContentMemories("user-1", workspace)).toBe(2);
    const calls = (rememberForUser as jest.Mock).mock.calls;
    expect(calls.map((c) => [c[2].content, c[2].source, c[2].weight])).toEqual([
      ["Gym on Tuesday mornings", "document", 0.6],
      ["Takes a German course", "mail", 0.6],
    ]);
  });

  it("does nothing when the switch is off: no read, no AI call", async () => {
    enabled.mockResolvedValue(false);
    expect(await extractContentMemories("user-1", workspace)).toBe(0);
    expect(prisma.page.findMany).not.toHaveBeenCalled();
    expect(prisma.mailMessage.findMany).not.toHaveBeenCalled();
    expect(prepared).not.toHaveBeenCalled();
  });

  it("does not save when the switch is turned off while the model is answering", async () => {
    prepared.mockResolvedValue(
      ai(
        JSON.stringify([
          { kind: "fact", from: "mail", content: "Takes a course" },
        ])
      )
    );
    enabled.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await extractContentMemories("user-1", workspace)).toBe(0);
    expect(rememberForUser).not.toHaveBeenCalled();
  });

  it("does nothing when no AI can answer or there is nothing to read", async () => {
    prepared.mockResolvedValue({ ai: {}, source: "none" });
    expect(await extractContentMemories("user-1", workspace)).toBe(0);
    (prisma.page.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.mailMessage.findMany as jest.Mock).mockResolvedValue([]);
    prepared.mockClear();
    expect(await extractContentMemories("user-1", workspace)).toBe(0);
    expect(prepared).not.toHaveBeenCalled();
  });
});

describe("a habit line the person deleted", () => {
  it("is not computed again, while the others still are", async () => {
    (prisma.userSettings.findUnique as jest.Mock).mockResolvedValue({
      timeZone: "UTC",
    });
    // eight finished tasks at 10:30, all taking twice the estimate
    (prisma.task.findMany as jest.Mock).mockResolvedValue(
      Array.from({ length: 8 }, (_, i) =>
        at(`2026-09-0${i + 1}T10:30:00Z`, { actualMinutes: 60 })
      )
    );
    (getLearnedSkips as jest.Mock).mockResolvedValueOnce([
      "ws-1:habit:peak-hours",
    ]);
    await refreshHabitMemories("user-1", "ws-1");
    const keys = (upsertKeyedMemory as jest.Mock).mock.calls.map(
      (c) => c[2].sourceKey
    );
    expect(keys).toEqual(["habit:duration-ratio"]);
  });
});

describe("runLearning", () => {
  it("learns nothing while the switch is off", async () => {
    enabled.mockResolvedValue(false);
    await runLearning("user-1", workspace);
    expect(prisma.userSettings.updateMany).not.toHaveBeenCalled();
    expect(prisma.task.findMany).not.toHaveBeenCalled();
    expect(upsertKeyedMemory).not.toHaveBeenCalled();
    expect(prepared).not.toHaveBeenCalled();
  });

  it("runs the habits and the content pass once, and not again within the day", async () => {
    (prisma.userSettings.updateMany as jest.Mock)
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValue({ count: 0 });
    (prisma.userSettings.findUnique as jest.Mock).mockResolvedValue({
      timeZone: "UTC",
    });
    (prisma.task.findMany as jest.Mock).mockResolvedValue(
      Array.from({ length: 8 }, (_, i) => at(`2026-09-0${i + 1}T10:30:00Z`))
    );
    prepared.mockResolvedValue(ai("[]"));

    await runLearning("user-1", workspace);
    expect(upsertKeyedMemory).toHaveBeenCalled();
    expect(prepared).toHaveBeenCalledTimes(1);

    jest.clearAllMocks();
    enabled.mockResolvedValue(true);
    await runLearning("user-1", workspace);
    expect(prisma.task.findMany).not.toHaveBeenCalled();
    expect(prepared).not.toHaveBeenCalled();
  });

  it("never throws, so Ask does not fail because learning did", async () => {
    (prisma.userSettings.updateMany as jest.Mock).mockRejectedValue(
      new Error("db down")
    );
    await expect(runLearning("user-1", workspace)).resolves.toBeUndefined();
  });
});
