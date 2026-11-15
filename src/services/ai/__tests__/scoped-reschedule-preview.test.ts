import {
  SchedulePreviewConflictError,
  applyReschedulePreview,
  createReschedulePreview,
  undoReschedulePreview,
} from "../reschedule-preview";

type Row = {
  id: string;
  title: string;
  status: string;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  scheduleScore: number | null;
  lastScheduled: Date | null;
  isAutoScheduled: boolean;
  autoScheduled: boolean;
  updatedAt: Date;
  estimatedMinutes: number | null;
  duration: number | null;
  scheduleLocked: boolean;
  isFrozen: boolean;
  userId: string;
  assigneeId: string | null;
  scheduleId: string | null;
  availableFrom: Date | null;
  startDate: Date | null;
  postponedUntil: Date | null;
  dependsOnId: string | null;
  dependsOn: { status: string } | null;
  blockedByDependencies: { blocker: { status: string } }[];
};
type Block = {
  taskId: string;
  start: Date;
  end: Date;
  chunkIndex: number;
  chunkCount: number;
  isFrozen: boolean;
};

const state: {
  tasks: Row[];
  blocks: Block[];
  events: { start: Date; end: Date; updatedAt: Date; id: string }[];
  writes: string[];
} = { tasks: [], blocks: [], events: [], writes: [] };

jest.mock("@/lib/prisma", () => {
  const fake: Record<string, unknown> = {
    task: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        const id = where.id as { in?: string[]; notIn?: string[] } | undefined;
        let rows = state.tasks;
        if (id?.in) rows = rows.filter((t) => id.in!.includes(t.id));
        if (id?.notIn) {
          // the overlap check before apply: open tasks outside the set
          const lt = (where.scheduledStart as { lt: Date }).lt;
          const gt = (where.scheduledEnd as { gt: Date }).gt;
          rows = rows.filter(
            (t) =>
              !id.notIn!.includes(t.id) &&
              t.status !== "completed" &&
              t.scheduledStart! < lt &&
              t.scheduledEnd! > gt
          );
        }
        return rows.map((t) => ({ ...t }));
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<Row>;
      }) => {
        state.writes.push(where.id);
        const row = state.tasks.find((t) => t.id === where.id);
        if (row) Object.assign(row, data);
        return { count: row ? 1 : 0 };
      },
    },
    scheduledBlock: {
      findMany: async ({ where }: { where: Record<string, unknown> }) => {
        const notIn = (where.taskId as { notIn?: string[] } | undefined)?.notIn;
        return state.blocks
          .filter((b) => !notIn || !notIn.includes(b.taskId))
          .map((b) => ({ ...b }));
      },
      deleteMany: async ({
        where,
      }: {
        where: { taskId: { in: string[] } };
      }) => {
        state.blocks = state.blocks.filter(
          (b) => !where.taskId.in.includes(b.taskId)
        );
        return { count: 0 };
      },
      createMany: async ({ data }: { data: Block[] }) => {
        state.blocks.push(...data);
        return { count: data.length };
      },
    },
    calendarEvent: { findMany: async () => state.events },
    workSchedule: {
      findMany: async () => [],
      findFirst: async () => ({ id: "default" }),
    },
    userSettings: { findUnique: async () => ({ timeZone: "Europe/Zurich" }) },
    autoScheduleSettings: {
      findUnique: async () => ({
        workHourStart: 9,
        workHourEnd: 17,
        workDays: "[1,2,3,4,5]",
        excludedCalendars: null,
        updatedAt: new Date(0),
      }),
    },
    schedulingPreferences: { findUnique: async () => null },
    energyProfileWindow: { findMany: async () => [] },
    flexibleHoursOverride: { findMany: async () => [] },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(fake),
  };
  return { prisma: fake };
});
jest.mock("../encryption", () => ({
  encryptSecret: (value: string) => `enc:${value}`,
  decryptSecret: (value: string) => value.replace(/^enc:/, ""),
}));
jest.mock("@/services/scheduling/busy-feeds", () => ({
  blockingEventWhere: {},
  resolveBusyFeedIds: async () => ["feed"],
}));
jest.mock("@/services/scheduling/TaskSchedulingService", () => ({
  scheduleAllTasksForUserDetailed: jest.fn(),
}));
jest.mock("@/services/personal-time/service", () => ({
  personalBusyBlocks: async () => [],
}));
jest.mock("@/lib/work-week-server", () => ({
  loadWeekHours: async () =>
    Array.from({ length: 7 }, (_, day) => ({
      day,
      on: day >= 1 && day <= 5,
      ranges: day >= 1 && day <= 5 ? [{ start: "09:00", end: "17:00" }] : [],
    })),
}));
jest.mock("@/lib/auth/workspace-auth", () => ({
  workspaceDataScopeWhere: () => ({}),
}));
jest.mock("@/lib/activation-events", () => ({ recordActivation: jest.fn() }));
jest.mock("@/lib/realtime/publish", () => ({
  publishRealtimeEvent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const d = (iso: string) => new Date(iso);
// Wednesday 18.11.2026, 10:07 in Zurich.
const NOW = d("2026-11-18T09:07:00Z");
const workspace = { workspaceId: "w1" } as never;

const row = (
  id: string,
  start: string,
  end: string,
  extra: Partial<Row> = {}
): Row => ({
  id,
  title: id,
  status: "todo",
  scheduledStart: d(start),
  scheduledEnd: d(end),
  scheduleScore: 1,
  lastScheduled: d("2026-11-17T08:00:00Z"),
  isAutoScheduled: true,
  autoScheduled: true,
  updatedAt: d("2026-11-17T08:00:00Z"),
  estimatedMinutes: 60,
  duration: null,
  scheduleLocked: false,
  isFrozen: false,
  userId: "u1",
  assigneeId: "u1",
  scheduleId: null,
  availableFrom: null,
  startDate: null,
  postponedUntil: null,
  dependsOnId: null,
  dependsOn: null,
  blockedByDependencies: [],
  ...extra,
});

const snapshotOf = (id: string) => {
  const task = state.tasks.find((t) => t.id === id)!;
  return JSON.stringify({
    start: task.scheduledStart?.toISOString(),
    end: task.scheduledEnd?.toISOString(),
    blocks: state.blocks
      .filter((b) => b.taskId === id)
      .map(({ taskId, start, end, chunkIndex }) => ({
        taskId,
        start,
        end,
        chunkIndex,
      })),
  });
};

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW);
  state.writes = [];
  state.events = [
    // 12:15 to 13:15 Zurich
    {
      id: "e1",
      start: d("2026-11-18T11:15:00Z"),
      end: d("2026-11-18T12:15:00Z"),
      updatedAt: d("2026-11-10T00:00:00Z"),
    },
  ];
  state.tasks = [
    row("missed-a", "2026-11-18T07:30:00Z", "2026-11-18T08:30:00Z"),
    row("missed-b", "2026-11-18T08:30:00Z", "2026-11-18T09:00:00Z", {
      estimatedMinutes: 30,
    }),
    // not asked for, also in the past
    row("other-past", "2026-11-18T07:00:00Z", "2026-11-18T07:30:00Z"),
    // pinned, in the way of the first gap
    row("pinned", "2026-11-18T09:15:00Z", "2026-11-18T10:15:00Z", {
      scheduleLocked: true,
      isAutoScheduled: false,
      autoScheduled: false,
    }),
    // another auto task later today
    row("later", "2026-11-18T10:15:00Z", "2026-11-18T11:15:00Z"),
    row("done", "2026-11-18T07:00:00Z", "2026-11-18T08:00:00Z", {
      status: "completed",
    }),
  ];
  state.blocks = state.tasks.map((t) => ({
    taskId: t.id,
    start: t.scheduledStart!,
    end: t.scheduledEnd!,
    chunkIndex: 0,
    chunkCount: 1,
    isFrozen: false,
  }));
});
afterEach(() => jest.useRealTimers());

describe("scoped reschedule preview", () => {
  it("moves only the listed tasks, after now, around everything else", async () => {
    const result = await createReschedulePreview("u1", workspace, {
      taskIds: ["missed-a", "missed-b", "pinned", "done", "ghost"],
    });
    expect(result.changes.map((c) => c.taskId).sort()).toEqual([
      "missed-a",
      "missed-b",
    ]);
    for (const change of result.changes) {
      expect(new Date(change.toStart!).getTime()).toBeGreaterThanOrEqual(
        NOW.getTime()
      );
      expect(["missed", "overlaps"]).toContain(change.reason);
    }
    expect(result.changes.find((c) => c.taskId === "missed-a")).toEqual(
      expect.objectContaining({ explanation: "Missed at 08:30" })
    );
    // 13:15 Zurich = 12:15Z is the first free hour: pinned, "later" and the
    // event fill 10:15Z to 12:15Z.
    expect(
      result.changes.every(
        (c) =>
          new Date(c.toStart!).getTime() >= d("2026-11-18T12:15:00Z").getTime()
      )
    ).toBe(true);
    expect(
      Object.fromEntries(
        ("skipped" in result ? result.skipped : []).map((s) => [
          s.taskId,
          s.reason,
        ])
      )
    ).toEqual({ pinned: "pinned", done: "completed", ghost: "not_found" });
    // a preview writes nothing
    expect(state.writes).toEqual([]);
  });

  it("keeps and undoes exactly the previewed set", async () => {
    const untouched = ["other-past", "pinned", "later", "done"];
    const beforeUntouched = untouched.map(snapshotOf);
    const beforeMoved = ["missed-a", "missed-b"].map(snapshotOf);

    const preview = await createReschedulePreview("u1", workspace, {
      taskIds: ["missed-a", "missed-b"],
    });
    const applied = await applyReschedulePreview(
      "u1",
      workspace,
      preview.previewToken
    );
    expect(applied.changes.map((c) => c.taskId).sort()).toEqual([
      "missed-a",
      "missed-b",
    ]);
    expect([...new Set(state.writes)].sort()).toEqual(["missed-a", "missed-b"]);
    expect(untouched.map(snapshotOf)).toEqual(beforeUntouched);
    expect(["missed-a", "missed-b"].map(snapshotOf)).not.toEqual(beforeMoved);
    // the moved block moved with its task
    const block = state.blocks.find((b) => b.taskId === "missed-a")!;
    expect(block.start).toEqual(state.tasks[0].scheduledStart);

    state.writes = [];
    await undoReschedulePreview("u1", workspace, applied.undoToken);
    expect([...new Set(state.writes)].sort()).toEqual(["missed-a", "missed-b"]);
    expect(["missed-a", "missed-b"].map(snapshotOf)).toEqual(beforeMoved);
    expect(untouched.map(snapshotOf)).toEqual(beforeUntouched);
  });

  it("is not blocked by a change to an unrelated task", async () => {
    const preview = await createReschedulePreview("u1", workspace, {
      taskIds: ["missed-a"],
    });
    // someone renames an unrelated task meanwhile
    state.tasks.find((t) => t.id === "later")!.updatedAt = new Date();
    await expect(
      applyReschedulePreview("u1", workspace, preview.previewToken)
    ).resolves.toBeDefined();
  });

  it("refuses to apply when a previewed task changed meanwhile", async () => {
    const preview = await createReschedulePreview("u1", workspace, {
      taskIds: ["missed-a"],
    });
    state.tasks.find((t) => t.id === "missed-a")!.scheduledStart = d(
      "2026-11-18T15:00:00Z"
    );
    await expect(
      applyReschedulePreview("u1", workspace, preview.previewToken)
    ).rejects.toBeInstanceOf(SchedulePreviewConflictError);
    expect(state.writes).toEqual([]);
  });

  it("returns an empty, harmless preview when nothing qualifies", async () => {
    const preview = await createReschedulePreview("u1", workspace, {
      taskIds: ["pinned", "ghost"],
    });
    expect(preview.changes).toEqual([]);
    const applied = await applyReschedulePreview(
      "u1",
      workspace,
      preview.previewToken
    );
    expect(applied.changes).toEqual([]);
    expect(state.writes).toEqual([]);
  });
});

describe("scoped reschedule preview: races and special tasks", () => {
  const preview = (taskIds: string[]) =>
    createReschedulePreview("u1", workspace, { taskIds });

  it("refuses to apply when another task moved into the target slot", async () => {
    const p = await preview(["missed-a"]);
    const target = (p.changes[0].toStart as string)!;
    // an unrelated task is dragged onto the slot after the preview
    const intruder = state.tasks.find((t) => t.id === "later")!;
    intruder.scheduledStart = d(target);
    intruder.scheduledEnd = new Date(d(target).getTime() + 30 * 60_000);
    await expect(
      applyReschedulePreview("u1", workspace, p.previewToken)
    ).rejects.toBeInstanceOf(SchedulePreviewConflictError);
    expect(state.writes).toEqual([]);
  });

  it("books the slot once when two scoped previews chose the same one", async () => {
    const first = await preview(["missed-a"]);
    const second = await preview(["missed-b"]);
    expect(first.changes[0].toStart).toBe(second.changes[0].toStart);
    await applyReschedulePreview("u1", workspace, first.previewToken);
    await expect(
      applyReschedulePreview("u1", workspace, second.previewToken)
    ).rejects.toBeInstanceOf(SchedulePreviewConflictError);
    expect(state.writes).toEqual(["missed-a"]);
  });

  it("leaves chunked tasks, a teammate's task and a waiting task alone", async () => {
    state.tasks.push(
      row("split", "2026-11-18T07:00:00Z", "2026-11-18T08:00:00Z"),
      row("mate", "2026-11-18T07:00:00Z", "2026-11-18T08:00:00Z", {
        assigneeId: "u2",
      }),
      row("waits", "2026-11-18T07:00:00Z", "2026-11-18T08:00:00Z", {
        dependsOnId: "x",
        dependsOn: { status: "todo" },
      })
    );
    state.blocks.push(
      ...["split", "mate", "waits"].map((id) => ({
        taskId: id,
        start: d("2026-11-18T07:00:00Z"),
        end: d("2026-11-18T08:00:00Z"),
        chunkIndex: 0,
        chunkCount: id === "split" ? 2 : 1,
        isFrozen: false,
      })),
      {
        taskId: "split",
        start: d("2026-11-19T07:00:00Z"),
        end: d("2026-11-19T08:00:00Z"),
        chunkIndex: 1,
        chunkCount: 2,
        isFrozen: false,
      }
    );
    const p = await preview(["split", "mate", "waits"]);
    expect(p.changes).toEqual([]);
    expect(
      Object.fromEntries(
        ("skipped" in p ? p.skipped : []).map((x) => [x.taskId, x.reason])
      )
    ).toEqual({ split: "split", mate: "not_found", waits: "blocked" });
  });

  it("sizes a task with a zero estimate at 30 minutes", async () => {
    state.tasks[0].estimatedMinutes = 0;
    state.tasks[0].duration = null;
    const p = await preview(["missed-a"]);
    const change = p.changes[0];
    expect(
      new Date(change.toEnd!).getTime() - new Date(change.toStart!).getTime()
    ).toBe(30 * 60_000);
  });
});
