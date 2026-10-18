import { AgentMemoryKind, AgentMemorySource } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import {
  clearAllAgentMemories,
  forgetForUser,
  getLearnedDurationRatio,
  listAgentMemories,
  listMemoriesForExport,
  listMemoriesForUse,
  publicMemory,
  rememberForUser,
  setLearningEnabled,
  updateMemoryForUser,
  upsertKeyedMemory,
} from "../memory";

type Row = Record<string, unknown> & { id: string };
let rows: Row[] = [];
let settings: { userId: string; learnAboutMe: boolean } | null = null;
let seq = 0;

function matches(row: Row, where: Record<string, unknown> = {}) {
  return Object.entries(where).every(([key, want]) => {
    if (want && typeof want === "object" && !(want instanceof Date)) {
      const w = want as { in?: unknown[]; notIn?: unknown[] };
      if (w.in && !w.in.includes(row[key])) return false;
      if (w.notIn && w.notIn.includes(row[key])) return false;
      return true;
    }
    return row[key] === want;
  });
}

jest.mock("@/lib/prisma", () => ({
  prisma: {
    agentMemory: {
      findMany: jest.fn(async ({ where, take }) =>
        rows.filter((r) => matches(r, where)).slice(0, take ?? 1000)
      ),
      findFirst: jest.fn(
        async ({ where }) => rows.find((r) => matches(r, where)) ?? null
      ),
      count: jest.fn(
        async ({ where }) => rows.filter((r) => matches(r, where)).length
      ),
      create: jest.fn(async ({ data }) => {
        const row = {
          id: `m${++seq}`,
          weight: 1,
          sourceKey: null,
          data: null,
          createdAt: new Date("2026-10-01"),
          updatedAt: new Date("2026-10-01"),
          lastUsedAt: new Date("2026-10-01"),
          ...data,
        } as Row;
        rows.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }) => {
        const row = rows.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return row;
      }),
      deleteMany: jest.fn(async ({ where }) => {
        const gone = rows.filter((r) => matches(r, where));
        rows = rows.filter((r) => !gone.includes(r));
        return { count: gone.length };
      }),
    },
    userSettings: {
      findUnique: jest.fn(async () => settings),
      upsert: jest.fn(async ({ update, create }) => {
        settings = { ...(settings ?? create), ...update };
        return settings;
      }),
    },
  },
}));

const U = "user-1";
const W = "ws-1";

beforeEach(() => {
  rows = [];
  settings = null;
  seq = 0;
  jest.clearAllMocks();
});

describe("the switch", () => {
  it("is off until the person turns it on, and nothing learned is used while off", async () => {
    await rememberForUser(U, W, {
      kind: AgentMemoryKind.preference,
      content: "No meetings before 10",
    });
    expect(await listMemoriesForUse(U, W)).toEqual([]);
    // the person can still read the list
    expect(await listAgentMemories(U, W)).toHaveLength(1);

    await setLearningEnabled(U, true);
    expect((await listMemoriesForUse(U, W)).map((m) => m.content)).toEqual([
      "No meetings before 10",
    ]);

    await setLearningEnabled(U, false);
    expect(await listMemoriesForUse(U, W)).toEqual([]);
  });

  it("gives the scheduler no ratio while off, and a clamped one while on", async () => {
    await upsertKeyedMemory(U, W, {
      sourceKey: "habit:duration-ratio",
      kind: AgentMemoryKind.pattern,
      content: "Tasks take about 3x the estimate.",
      source: AgentMemorySource.habit,
      data: { ratio: 3, samples: 12 },
    });
    expect(await getLearnedDurationRatio(U, W)).toBeNull();
    await setLearningEnabled(U, true);
    expect(await getLearnedDurationRatio(U, W)).toBe(2);
    expect(await getLearnedDurationRatio(U, "other-ws")).toBeNull();
  });
});

describe("stored memories", () => {
  it("are sealed at rest and read back as plain text", async () => {
    const memory = await rememberForUser(U, W, {
      kind: AgentMemoryKind.fact,
      content: "I study German daily",
    });
    expect(memory.content).toBe("I study German daily");
    expect(rows[0].content).toMatch(/^enc:v1:/);
    expect(String(rows[0].content)).not.toContain("German");
    expect((await listAgentMemories(U, W))[0].content).toBe(
      "I study German daily"
    );
  });

  it("do not repeat, whatever the case, even though sealed text differs", async () => {
    await rememberForUser(U, W, {
      kind: AgentMemoryKind.fact,
      content: "I study German daily",
    });
    await rememberForUser(U, W, {
      kind: AgentMemoryKind.fact,
      content: "i study german daily",
    });
    expect(rows).toHaveLength(1);
  });

  it("refuse credentials, money and health", async () => {
    await expect(
      rememberForUser(U, W, {
        kind: AgentMemoryKind.fact,
        content: "My bank password is hunter2",
      })
    ).rejects.toThrow(/sensitive/);
    expect(rows).toHaveLength(0);
  });

  it("keep one line per key when Needt recomputes", async () => {
    const input = {
      sourceKey: "habit:peak-hours",
      kind: AgentMemoryKind.pattern,
      source: AgentMemorySource.habit,
    };
    await upsertKeyedMemory(U, W, { ...input, content: "Peak 09:00-12:00." });
    await upsertKeyedMemory(U, W, { ...input, content: "Peak 10:00-13:00." });
    expect(rows).toHaveLength(1);
    expect((await listAgentMemories(U, W))[0].content).toBe(
      "Peak 10:00-13:00."
    );
  });

  it("are edited re-sealed, and an edited line becomes the person's own", async () => {
    await upsertKeyedMemory(U, W, {
      sourceKey: "habit:peak-hours",
      kind: AgentMemoryKind.pattern,
      source: AgentMemorySource.habit,
      content: "Peak 09:00-12:00.",
      data: { startHour: 9 },
    });
    const edited = await updateMemoryForUser(U, W, rows[0].id, {
      content: "I work best 07:00-10:00",
    });
    expect(edited?.content).toBe("I work best 07:00-10:00");
    expect(rows[0].content).toMatch(/^enc:v1:/);
    expect(rows[0]).toMatchObject({ sourceKey: null, source: "chat" });
    expect(
      await updateMemoryForUser(U, W, "nope", { content: "abc" })
    ).toBeNull();
    await expect(
      updateMemoryForUser(U, W, rows[0].id, { content: "my api key is x" })
    ).rejects.toThrow(/sensitive/);
  });

  it("belong to one user and one workspace", async () => {
    await rememberForUser(U, W, {
      kind: AgentMemoryKind.fact,
      content: "Lives in Lisbon",
    });
    const id = rows[0].id;
    expect(await forgetForUser("someone-else", W, id)).toBe(false);
    expect(await forgetForUser(U, "other-ws", id)).toBe(false);
    expect(await listAgentMemories(U, "other-ws")).toEqual([]);
    expect(await forgetForUser(U, W, id)).toBe(true);
  });

  it("export in plain text across workspaces; deleting clears every workspace", async () => {
    await rememberForUser(U, W, {
      kind: AgentMemoryKind.fact,
      content: "Lives in Lisbon",
    });
    await rememberForUser(U, "ws-2", {
      kind: AgentMemoryKind.goal,
      content: "Ship the app in spring",
    });
    const exported = await listMemoriesForExport(U);
    expect(exported.map((m) => m.content).sort()).toEqual([
      "Lives in Lisbon",
      "Ship the app in spring",
    ]);
    expect(exported.map((m) => m.workspaceId).sort()).toEqual([W, "ws-2"]);
    expect((await clearAllAgentMemories(U)).count).toBe(2);
  });

  it("show the API only the line, where it came from and when", async () => {
    await rememberForUser(U, W, {
      kind: AgentMemoryKind.preference,
      content: "No meetings before 10",
    });
    const [memory] = await listAgentMemories(U, W);
    expect(Object.keys(publicMemory(memory)).sort()).toEqual([
      "content",
      "createdAt",
      "id",
      "kind",
      "source",
      "updatedAt",
    ]);
  });
});

it("reads a row written before encryption existed", async () => {
  rows.push({
    id: "old",
    userId: U,
    workspaceId: W,
    kind: "fact",
    content: "Plain legacy line",
    source: "chat",
    weight: 1,
    sourceKey: null,
    data: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastUsedAt: new Date(),
  });
  expect((await listAgentMemories(U, W))[0].content).toBe("Plain legacy line");
  expect(prisma.agentMemory.findMany).toHaveBeenCalled();
});
