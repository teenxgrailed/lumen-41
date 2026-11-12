import {
  ScheduleSnapshot,
  diffScheduleSnapshots,
  taskLoadByDay,
} from "../reschedule-preview";

describe("reschedule preview staging", () => {
  it("returns only changed placements", () => {
    const before: ScheduleSnapshot = {
      tasks: [
        {
          id: "task",
          title: "Write",
          scheduledStart: null,
          scheduledEnd: null,
          scheduleScore: null,
          lastScheduled: null,
          isAutoScheduled: true,
          autoScheduled: true,
          updatedAt: "2026-07-18T08:00:00.000Z",
        },
      ],
      blocks: [],
    };
    const after: ScheduleSnapshot = {
      ...before,
      tasks: [
        {
          ...before.tasks[0],
          scheduledStart: "2026-07-18T09:00:00.000Z",
          scheduledEnd: "2026-07-18T10:00:00.000Z",
        },
      ],
    };
    expect(diffScheduleSnapshots(before, after)).toHaveLength(1);
    expect(diffScheduleSnapshots(before, after)[0]).toEqual(
      expect.objectContaining({
        explanation: "Placed in deterministic available working time.",
      })
    );
  });
});

describe("taskLoadByDay", () => {
  it("sums task minutes per day before and after, blocks first", () => {
    const task = (id: string, start: string | null, end: string | null) => ({
      id,
      title: id,
      scheduledStart: start,
      scheduledEnd: end,
      scheduleScore: null,
      lastScheduled: null,
      isAutoScheduled: true,
      autoScheduled: true,
      updatedAt: "2026-07-01T00:00:00.000Z",
    });
    const before = {
      tasks: [
        task("a", "2026-07-06T09:00:00.000Z", "2026-07-06T10:00:00.000Z"),
      ],
      blocks: [],
    };
    const after = {
      tasks: [
        task("a", "2026-07-07T09:00:00.000Z", "2026-07-07T09:30:00.000Z"),
      ],
      blocks: [
        {
          taskId: "a",
          start: "2026-07-07T09:00:00.000Z",
          end: "2026-07-07T09:30:00.000Z",
          chunkIndex: 0,
          chunkCount: 2,
          isFrozen: false,
        },
        {
          taskId: "a",
          start: "2026-07-07T13:00:00.000Z",
          end: "2026-07-07T13:30:00.000Z",
          chunkIndex: 1,
          chunkCount: 2,
          isFrozen: false,
        },
      ],
    };
    const load = taskLoadByDay(
      before,
      after,
      "UTC",
      new Date("2026-07-06T08:00:00.000Z"),
      2
    );
    expect(load).toEqual([
      { date: "2026-07-06", beforeMinutes: 60, afterMinutes: 0 },
      { date: "2026-07-07", beforeMinutes: 0, afterMinutes: 60 },
    ]);
  });
});
