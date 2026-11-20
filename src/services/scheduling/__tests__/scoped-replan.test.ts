import { type WeekHours } from "@/lib/work-week";

import { planScopedReplan, startDateFloor } from "../scoped-replan";

jest.mock("@/lib/prisma", () => ({ prisma: {} }));

const d = (iso: string) => new Date(iso);
const week = (
  on: Record<number, Array<{ start: string; end: string }>>
): WeekHours =>
  Array.from({ length: 7 }, (_, day) => ({
    day,
    on: !!on[day]?.length,
    ranges: on[day] ?? [],
  }));
const nineToFive = [{ start: "09:00", end: "17:00" }];
const WORKDAYS = week({
  1: nineToFive,
  2: nineToFive,
  3: nineToFive,
  4: nineToFive,
  5: nineToFive,
});
// Wednesday 18.11.2026, 10:07 in Zurich (UTC+1) = 09:07Z.
const NOW = d("2026-11-18T09:07:00Z");
const ZONE = "Europe/Zurich";

const task = (
  id: string,
  start: string | null,
  end: string | null,
  extra: Partial<{
    minutes: number;
    pinned: boolean;
    done: boolean;
    title: string;
    owned: boolean;
    notBefore: Date | null;
    blocked: boolean;
    ownHours: boolean;
  }> = {}
) => ({
  id,
  title: extra.title ?? id,
  scheduledStart: start ? d(start) : null,
  scheduledEnd: end ? d(end) : null,
  minutes: extra.minutes ?? 60,
  pinned: extra.pinned ?? false,
  done: extra.done,
  owned: extra.owned,
  notBefore: extra.notBefore,
  blocked: extra.blocked,
  ownHours: extra.ownHours,
});

const plan = (
  input: Partial<Parameters<typeof planScopedReplan>[0]> & {
    requestedIds: string[];
  }
) =>
  planScopedReplan({
    tasks: [],
    events: [],
    blocks: [],
    week: WORKDAYS,
    now: NOW,
    zone: ZONE,
    ...input,
  });

describe("planScopedReplan", () => {
  it("moves only the listed missed tasks, never earlier than now", () => {
    const result = plan({
      requestedIds: ["missed"],
      tasks: [
        task("missed", "2026-11-18T07:30:00Z", "2026-11-18T08:00:00Z"),
        // an unrelated auto task that is also in the past: not asked for
        task("other-past", "2026-11-18T07:00:00Z", "2026-11-18T07:30:00Z"),
      ],
    });
    expect(result.moves.map((m) => m.taskId)).toEqual(["missed"]);
    const move = result.moves[0];
    expect(move.to.start.getTime()).toBeGreaterThanOrEqual(NOW.getTime());
    expect(move.reason).toBe("missed");
    expect(move.explanation).toBe("Missed at 08:30");
    expect(result.skipped).toEqual([]);
  });

  it("treats pinned tasks, other auto tasks and events as busy, with a 15 minute buffer", () => {
    const result = plan({
      requestedIds: ["missed"],
      tasks: [
        task("missed", "2026-11-18T07:30:00Z", "2026-11-18T08:30:00Z"),
        // pinned 10:15 to 11:15 Zurich
        task("pinned", "2026-11-18T09:15:00Z", "2026-11-18T10:15:00Z", {
          pinned: true,
        }),
        // auto task 11:15 to 12:15 Zurich
        task("auto", "2026-11-18T10:15:00Z", "2026-11-18T11:15:00Z"),
      ],
      // meeting 12:15 to 13:15 Zurich
      events: [
        { start: d("2026-11-18T11:15:00Z"), end: d("2026-11-18T12:15:00Z") },
      ],
    });
    const { to } = result.moves[0];
    // the meeting ends 12:15Z; the scheduler's buffer puts the task at 12:30Z
    expect(to.start.toISOString()).toBe("2026-11-18T12:30:00.000Z");
    expect(to.end.toISOString()).toBe("2026-11-18T13:30:00.000Z");
  });

  it("skips pinned, completed, unscheduled, not-missed, foreign and unknown ids", () => {
    const result = plan({
      requestedIds: ["pin", "done", "none", "future", "ghost", "mate"],
      tasks: [
        task("pin", "2026-11-18T07:00:00Z", "2026-11-18T08:00:00Z", {
          pinned: true,
        }),
        task("done", "2026-11-18T07:00:00Z", "2026-11-18T08:00:00Z", {
          done: true,
        }),
        task("none", null, null),
        task("future", "2026-11-18T13:00:00Z", "2026-11-18T14:00:00Z"),
        task("mate", "2026-11-18T07:00:00Z", "2026-11-18T08:00:00Z", {
          owned: false,
        }),
      ],
    });
    expect(result.moves).toEqual([]);
    expect(
      Object.fromEntries(result.skipped.map((s) => [s.taskId, s.reason]))
    ).toEqual({
      pin: "pinned",
      done: "completed",
      none: "not_scheduled",
      future: "not_missed",
      ghost: "not_found",
      mate: "not_found",
    });
  });

  it("moves a task whose slot overlaps an event, and says so", () => {
    const result = plan({
      requestedIds: ["clash"],
      tasks: [task("clash", "2026-11-18T09:30:00Z", "2026-11-18T10:30:00Z")],
      events: [
        { start: d("2026-11-18T10:00:00Z"), end: d("2026-11-18T11:00:00Z") },
      ],
    });
    expect(result.moves[0].reason).toBe("overlaps");
    expect(result.moves[0].to.start.getTime()).toBeGreaterThanOrEqual(
      d("2026-11-18T11:00:00Z").getTime()
    );
  });

  it("does not stack two moved tasks on each other and keeps the order", () => {
    const result = plan({
      requestedIds: ["b", "a"],
      tasks: [
        task("a", "2026-11-18T07:00:00Z", "2026-11-18T08:00:00Z"),
        task("b", "2026-11-18T07:30:00Z", "2026-11-18T08:30:00Z"),
      ],
    });
    expect(result.moves.map((m) => m.taskId)).toEqual(["a", "b"]);
    expect(
      result.moves[1].to.start.getTime() - result.moves[0].to.end.getTime()
    ).toBeGreaterThanOrEqual(15 * 60_000);
  });

  it("is deterministic and ignores duplicate ids", () => {
    const input = {
      requestedIds: ["a", "a", "b"],
      tasks: [
        task("a", "2026-11-18T07:00:00Z", "2026-11-18T08:00:00Z"),
        task("b", "2026-11-18T07:00:00Z", "2026-11-18T08:00:00Z"),
      ],
    };
    const first = plan(input);
    expect(first.moves).toHaveLength(2);
    expect(plan(input)).toEqual(first);
  });

  it("keeps a skipped requested task where it is, as busy time", () => {
    const result = plan({
      requestedIds: ["missed", "future"],
      tasks: [
        task("missed", "2026-11-18T07:00:00Z", "2026-11-18T08:00:00Z"),
        // asked for but not missed: it stays, so nothing may land on it
        task("future", "2026-11-18T09:15:00Z", "2026-11-18T10:15:00Z"),
      ],
    });
    expect(result.moves[0].to.start.getTime()).toBeGreaterThanOrEqual(
      d("2026-11-18T10:15:00Z").getTime()
    );
  });

  it("reports a task as unscheduled when no gap exists, and leaves it", () => {
    const result = plan({
      requestedIds: ["big"],
      tasks: [
        task("big", "2026-11-18T07:00:00Z", "2026-11-18T08:00:00Z", {
          minutes: 600,
        }),
      ],
    });
    expect(result.moves).toEqual([]);
    expect(result.unscheduled.map((u) => u.taskId)).toEqual(["big"]);
  });

  it("uses the task's own length", () => {
    const result = plan({
      requestedIds: ["short"],
      tasks: [
        task("short", "2026-11-18T07:00:00Z", "2026-11-18T07:30:00Z", {
          minutes: 30,
        }),
      ],
    });
    const { to } = result.moves[0];
    expect(to.end.getTime() - to.start.getTime()).toBe(30 * 60_000);
  });

  it("treats the blocks of other tasks as busy but not the moved task's own", () => {
    const result = plan({
      requestedIds: ["missed"],
      tasks: [task("missed", "2026-11-18T07:00:00Z", "2026-11-18T08:00:00Z")],
      blocks: [
        {
          taskId: "someone",
          start: d("2026-11-18T09:15:00Z"),
          end: d("2026-11-18T10:15:00Z"),
        },
        {
          taskId: "missed",
          start: d("2026-11-18T07:00:00Z"),
          end: d("2026-11-18T08:00:00Z"),
        },
      ],
    });
    expect(result.moves[0].to.start.getTime()).toBeGreaterThanOrEqual(
      d("2026-11-18T10:15:00Z").getTime()
    );
  });
});

describe("planScopedReplan: the person's real hours", () => {
  it("uses a short work window instead of falling back to 9 to 17", () => {
    // Wednesdays only, 10:00 to 12:00 Zurich: a 3 hour window rule would not fit
    const result = plan({
      requestedIds: ["a"],
      week: week({ 3: [{ start: "10:00", end: "12:00" }] }),
      tasks: [task("a", "2026-11-18T07:00:00Z", "2026-11-18T08:00:00Z")],
    });
    // now is 10:07 Zurich: next quarter hour inside the window
    expect(result.moves[0].to.start.toISOString()).toBe(
      "2026-11-18T09:15:00.000Z"
    );
    expect(result.moves[0].to.end.toISOString()).toBe(
      "2026-11-18T10:15:00.000Z"
    );
  });

  it("works on a weekend-only week", () => {
    const result = plan({
      requestedIds: ["a"],
      week: week({ 6: [{ start: "10:00", end: "14:00" }] }),
      tasks: [task("a", "2026-11-18T07:00:00Z", "2026-11-18T08:00:00Z")],
    });
    // Saturday 21.11.2026 10:00 Zurich = 09:00Z
    expect(result.moves[0].to.start.toISOString()).toBe(
      "2026-11-21T09:00:00.000Z"
    );
  });

  it("uses the second range of a split day", () => {
    const result = plan({
      requestedIds: ["a"],
      week: week({
        3: [
          { start: "09:00", end: "10:30" },
          { start: "14:00", end: "16:00" },
        ],
      }),
      tasks: [task("a", "2026-11-18T07:00:00Z", "2026-11-18T08:00:00Z")],
    });
    // 10:07 to 10:30 is too short for an hour: the afternoon range
    expect(result.moves[0].to.start.toISOString()).toBe(
      "2026-11-18T13:00:00.000Z"
    );
  });

  it("respects a flexible-hours override and personal time", () => {
    const result = plan({
      requestedIds: ["a"],
      overrides: [
        {
          date: "2026-11-18",
          kind: "STOP_EARLY",
          startTime: null,
          endTime: "11:00",
        },
        {
          date: "2026-11-19",
          kind: "START_LATER",
          startTime: "13:00",
          endTime: null,
        },
      ],
      // personal time (lunch) 13:00 to 14:00 on the 19th, Zurich
      events: [
        { start: d("2026-11-19T12:00:00Z"), end: d("2026-11-19T13:00:00Z") },
      ],
      tasks: [task("a", "2026-11-18T07:00:00Z", "2026-11-18T08:00:00Z")],
    });
    // 18th: only 10:07 to 11:00 is left, too short. 19th: starts 13:00, lunch
    // to 14:00 plus buffer: 14:15 Zurich = 13:15Z
    expect(result.moves[0].to.start.toISOString()).toBe(
      "2026-11-19T13:15:00.000Z"
    );
  });

  it("skips a whole blocked day", () => {
    const result = plan({
      requestedIds: ["a"],
      overrides: [
        {
          date: "2026-11-18",
          kind: "BLOCK_WHOLE_DAY",
          startTime: null,
          endTime: null,
        },
      ],
      tasks: [task("a", "2026-11-18T07:00:00Z", "2026-11-18T08:00:00Z")],
    });
    expect(result.moves[0].to.start.getTime()).toBeGreaterThanOrEqual(
      d("2026-11-19T08:00:00Z").getTime()
    );
  });
});

describe("planScopedReplan: split, blocked and not-yet tasks", () => {
  it("skips a task with several chunks, even when its first chunk is past", () => {
    const result = plan({
      requestedIds: ["split"],
      tasks: [task("split", "2026-11-18T07:00:00Z", "2026-11-18T08:00:00Z")],
      blocks: [
        {
          taskId: "split",
          start: d("2026-11-18T07:00:00Z"),
          end: d("2026-11-18T08:00:00Z"),
          chunkCount: 2,
        },
        {
          taskId: "split",
          start: d("2026-11-18T13:00:00Z"),
          end: d("2026-11-18T14:00:00Z"),
          chunkCount: 2,
        },
      ],
    });
    expect(result.moves).toEqual([]);
    expect(result.skipped).toEqual([{ taskId: "split", reason: "split" }]);
  });

  it("skips a task whose block was frozen by hand", () => {
    const result = plan({
      requestedIds: ["frozen"],
      tasks: [task("frozen", "2026-11-18T07:00:00Z", "2026-11-18T08:00:00Z")],
      blocks: [
        {
          taskId: "frozen",
          start: d("2026-11-18T07:00:00Z"),
          end: d("2026-11-18T08:00:00Z"),
          isFrozen: true,
        },
      ],
    });
    expect(result.skipped).toEqual([{ taskId: "frozen", reason: "split" }]);
  });

  it("judges a one-chunk task by its block's end", () => {
    const result = plan({
      requestedIds: ["late"],
      // the task row says it ended, but its block runs on into the future
      tasks: [task("late", "2026-11-18T07:00:00Z", "2026-11-18T08:00:00Z")],
      blocks: [
        {
          taskId: "late",
          start: d("2026-11-18T07:00:00Z"),
          end: d("2026-11-18T13:00:00Z"),
        },
      ],
    });
    expect(result.skipped).toEqual([{ taskId: "late", reason: "not_missed" }]);
  });

  it("never places a task before its availableFrom, start date or postponedUntil", () => {
    const result = plan({
      requestedIds: ["later"],
      tasks: [
        task("later", "2026-11-18T07:00:00Z", "2026-11-18T08:00:00Z", {
          notBefore: d("2026-11-20T08:00:00Z"),
        }),
      ],
    });
    expect(result.moves[0].to.start.getTime()).toBeGreaterThanOrEqual(
      d("2026-11-20T08:00:00Z").getTime()
    );
  });

  it("leaves a task that waits on an unfinished one, and one on its own hours", () => {
    const result = plan({
      requestedIds: ["waits", "own"],
      tasks: [
        task("waits", "2026-11-18T07:00:00Z", "2026-11-18T08:00:00Z", {
          blocked: true,
        }),
        task("own", "2026-11-18T07:00:00Z", "2026-11-18T08:00:00Z", {
          ownHours: true,
        }),
      ],
    });
    expect(result.moves).toEqual([]);
    expect(result.skipped).toEqual([
      { taskId: "waits", reason: "blocked" },
      { taskId: "own", reason: "own_hours" },
    ]);
  });
});

describe("planScopedReplan: zone-aware days", () => {
  it("treats a startDate as the start of that day in the person's zone", () => {
    // 2026-11-23 is stored as midnight UTC; in Zurich the day starts at 23:00Z
    expect(
      startDateFloor(d("2026-11-23T00:00:00.000Z"), ZONE)?.toISOString()
    ).toBe("2026-11-22T23:00:00.000Z");
    // a real instant stays as it is
    expect(
      startDateFloor(d("2026-11-23T10:30:00.000Z"), ZONE)?.toISOString()
    ).toBe("2026-11-23T10:30:00.000Z");
    expect(startDateFloor(null, ZONE)).toBeNull();
  });

  it("blocks all of a 25 hour day, not 24 hours of it", () => {
    // 25.10.2026 is the day the clocks go back in Zurich. Sundays only,
    // open nearly all day; the whole day is blocked.
    const result = plan({
      requestedIds: ["a"],
      now: d("2026-10-24T12:00:00Z"),
      week: week({ 0: [{ start: "00:00", end: "23:59" }] }),
      overrides: [
        {
          date: "2026-10-25",
          kind: "BLOCK_WHOLE_DAY",
          startTime: null,
          endTime: null,
        },
      ],
      tasks: [task("a", "2026-10-24T07:00:00Z", "2026-10-24T08:00:00Z")],
    });
    // with a +24h end the last local hour of the 25th (22:00Z) stayed free
    expect(result.moves[0].to.start.getTime()).toBeGreaterThanOrEqual(
      d("2026-10-31T23:00:00Z").getTime()
    );
  });
});
