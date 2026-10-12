import { prisma } from "@/lib/prisma";

import {
  STUCK_QUEUED_MS,
  STUCK_RUNNING_MS,
  WORKER_LOST_WARNING,
  processImportRun,
  sweepStuckImportRuns,
} from "../runner";
import { TodoistApiError } from "../todoist/client";
import { todoistSnapshotSchema } from "../todoist/types";
import fixture from "./fixtures/todoist-sync.json";
import { createMemoryStore } from "./memory-store";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    importRun: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/realtime/publish", () => ({
  publishRealtimeEvent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/services/imports/token-secret", () => ({
  openImportToken: (value: string | null) =>
    value === "enc:token" ? "todoist-token" : null,
}));

interface RunRow {
  id: string;
  userId: string;
  workspaceId: string;
  source: "todoist";
  status: string;
  encryptedToken: string | null;
  counts?: unknown;
  warnings?: unknown[];
}

/** A one-row fake of the ImportRun table, honouring the `where` filters the runner uses. */
function fakeRunTable(initial: RunRow) {
  const row: RunRow = { ...initial };
  const matches = (where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => {
      if (k === "id") return v === row.id;
      if (k === "status") return v === row.status;
      if (k === "encryptedToken")
        return (v as { not: null }).not === null && row.encryptedToken !== null;
      return true;
    });
  const apply = (data: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(data)) {
      if (k === "warnings") {
        const op = v as { set?: unknown[]; push?: unknown };
        row.warnings = op.set ?? [...(row.warnings ?? []), op.push];
      } else (row as unknown as Record<string, unknown>)[k] = v;
    }
  };
  jest.mocked(prisma.importRun.findUnique).mockImplementation((async () => ({
    ...row,
  })) as never);
  jest.mocked(prisma.importRun.updateMany).mockImplementation((async (args: {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
  }) => {
    if (!matches(args.where)) return { count: 0 };
    apply(args.data);
    return { count: 1 };
  }) as never);
  jest.mocked(prisma.importRun.update).mockImplementation((async (args: {
    data: Record<string, unknown>;
  }) => {
    apply(args.data);
    return { ...row };
  }) as never);
  return row;
}

const baseRun: RunRow = {
  id: "run-1",
  userId: "user-1",
  workspaceId: "ws-1",
  source: "todoist",
  status: "queued",
  encryptedToken: "enc:token",
};

const allowAll = () => ({
  allowCreate: async () => ({ allowed: true as const }),
});

describe("processImportRun", () => {
  beforeEach(() => jest.clearAllMocks());

  it("imports, marks the run done and wipes the token", async () => {
    const row = fakeRunTable(baseRun);
    const mem = createMemoryStore();
    const fetchSnapshot = jest
      .fn()
      .mockResolvedValue(todoistSnapshotSchema.parse(fixture));

    await processImportRun("run-1", {
      fetchTodoistSnapshot: fetchSnapshot,
      createStore: () => mem.store,
      createGuard: allowAll,
      loadUserTimeZone: async () => "UTC",
    });

    expect(fetchSnapshot).toHaveBeenCalledWith("todoist-token");
    expect(row.status).toBe("done");
    expect(row.encryptedToken).toBeNull();
    expect(row.counts).toMatchObject({ done: 16, failed: 0 });
    expect(mem.tasks.size).toBe(7);
  });

  it("fails clearly on a Todoist 401 and still wipes the token", async () => {
    const row = fakeRunTable(baseRun);
    await processImportRun("run-1", {
      fetchTodoistSnapshot: jest
        .fn()
        .mockRejectedValue(
          new TodoistApiError("unauthorized", "Todoist did not accept", 401)
        ),
      createStore: () => createMemoryStore().store,
      createGuard: allowAll,
      loadUserTimeZone: async () => "UTC",
    });
    expect(row.status).toBe("failed");
    expect(row.encryptedToken).toBeNull();
    expect(row.warnings).toEqual([
      { code: "todoist_unauthorized", message: "Todoist did not accept" },
    ]);
  });

  it("fails on a rate limit with its own code", async () => {
    const row = fakeRunTable(baseRun);
    await processImportRun("run-1", {
      fetchTodoistSnapshot: jest
        .fn()
        .mockRejectedValue(
          new TodoistApiError("rate_limited", "Try again later", 429)
        ),
      createStore: () => createMemoryStore().store,
      createGuard: allowAll,
      loadUserTimeZone: async () => "UTC",
    });
    expect(row.status).toBe("failed");
    expect(row.encryptedToken).toBeNull();
    expect(row.warnings).toEqual([
      expect.objectContaining({ code: "todoist_rate_limited" }),
    ]);
  });

  it("does nothing but wipe the token when the run was cancelled before it started", async () => {
    const row = fakeRunTable({ ...baseRun, status: "cancelled" });
    const fetchSnapshot = jest.fn();
    await processImportRun("run-1", {
      fetchTodoistSnapshot: fetchSnapshot,
      createStore: () => createMemoryStore().store,
      createGuard: allowAll,
      loadUserTimeZone: async () => "UTC",
    });
    expect(fetchSnapshot).not.toHaveBeenCalled();
    expect(row.status).toBe("cancelled");
    expect(row.encryptedToken).toBeNull();
  });

  it("fails when the token cannot be decrypted", async () => {
    const row = fakeRunTable({ ...baseRun, encryptedToken: "garbage" });
    const fetchSnapshot = jest.fn();
    await processImportRun("run-1", {
      fetchTodoistSnapshot: fetchSnapshot,
      createStore: () => createMemoryStore().store,
      createGuard: allowAll,
      loadUserTimeZone: async () => "UTC",
    });
    expect(fetchSnapshot).not.toHaveBeenCalled();
    expect(row.status).toBe("failed");
    expect(row.encryptedToken).toBeNull();
  });

  it("fails a stalled re-delivery of a run that is already running", async () => {
    const row = fakeRunTable({ ...baseRun, status: "running" });
    const fetchSnapshot = jest.fn();
    await processImportRun("run-1", {
      fetchTodoistSnapshot: fetchSnapshot,
      createStore: () => createMemoryStore().store,
      createGuard: allowAll,
      loadUserTimeZone: async () => "UTC",
    });
    expect(fetchSnapshot).not.toHaveBeenCalled();
    expect(row.status).toBe("failed");
    expect(row.encryptedToken).toBeNull();
    expect(row.warnings).toEqual([WORKER_LOST_WARNING]);
  });

  it("bumps updatedAt on every progress tick", async () => {
    fakeRunTable(baseRun);
    const big = todoistSnapshotSchema.parse({
      ...fixture,
      items: Array.from({ length: 60 }, (_, n) => ({
        id: `bulk-${n}`,
        project_id: "6Jf8VQXxpwv56VQ8",
        content: `Bulk ${n}`,
        priority: 1,
        labels: [],
      })),
    });
    await processImportRun("run-1", {
      fetchTodoistSnapshot: jest.fn().mockResolvedValue(big),
      createStore: () => createMemoryStore().store,
      createGuard: allowAll,
      loadUserTimeZone: async () => "UTC",
    });
    const progressWrites = jest
      .mocked(prisma.importRun.updateMany)
      .mock.calls.map(([args]) => args as { data: Record<string, unknown> })
      .filter((args) => "counts" in args.data && !("status" in args.data));
    expect(progressWrites.length).toBeGreaterThan(1);
    for (const write of progressWrites) {
      expect(write.data.updatedAt).toBeInstanceOf(Date);
    }
  });
});

describe("sweepStuckImportRuns", () => {
  beforeEach(() => jest.clearAllMocks());

  it("fails queued runs older than 2 h and running runs idle for 30 min, wiping tokens", async () => {
    jest.mocked(prisma.importRun.updateMany).mockResolvedValue({ count: 2 });
    const now = new Date("2026-10-12T12:00:00Z");
    await expect(sweepStuckImportRuns(now)).resolves.toBe(2);
    const [args] = jest.mocked(prisma.importRun.updateMany).mock.calls[0] as [
      {
        where: { OR: Array<Record<string, { lt: Date } | string>> };
        data: Record<string, unknown>;
      },
    ];
    expect(args.where.OR).toEqual([
      {
        status: "queued",
        createdAt: { lt: new Date(now.getTime() - STUCK_QUEUED_MS) },
      },
      {
        status: "running",
        updatedAt: { lt: new Date(now.getTime() - STUCK_RUNNING_MS) },
      },
    ]);
    expect(STUCK_QUEUED_MS).toBe(2 * 60 * 60 * 1_000);
    expect(STUCK_RUNNING_MS).toBe(30 * 60 * 1_000);
    expect(args.data).toMatchObject({
      status: "failed",
      encryptedToken: null,
      finishedAt: expect.any(Date),
      warnings: { push: WORKER_LOST_WARNING },
    });
  });
});
