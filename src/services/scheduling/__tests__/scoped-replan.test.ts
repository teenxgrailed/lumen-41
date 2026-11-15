import { planScopedReplan } from "../scoped-replan";

jest.mock("@/lib/prisma", () => ({ prisma: {} }));

const d = (iso: string) => new Date(iso);
const HOURS = { startHour: 9, endHour: 17, days: [1, 2, 3, 4, 5] };
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
  }> = {}
) => ({
  id,
  title: extra.title ?? id,
  scheduledStart: start ? d(start) : null,
  scheduledEnd: end ? d(end) : null,
  minutes: extra.minutes ?? 60,
  pinned: extra.pinned ?? false,
  done: extra.done,
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
    now: NOW,
    zone: ZONE,
    hours: HOURS,
    ...input,
  });

describe("planScopedReplan", () => {
  it("moves only the listed missed tasks, never earlier than now", () => {
    const result = plan({
      requestedIds: ["missed"],
      tasks: [
        // 08:30 to 09:30 Zurich, over by now
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

  it("treats pinned tasks, other auto tasks and events as busy", () => {
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
    // first free hour after 10:07: 13:15 Zurich = 12:15Z
    expect(to.start.toISOString()).toBe("2026-11-18T12:15:00.000Z");
    expect(to.end.toISOString()).toBe("2026-11-18T13:15:00.000Z");
  });

  it("skips pinned, completed, unscheduled, not-missed and unknown ids", () => {
    const result = plan({
      requestedIds: ["pin", "done", "none", "future", "ghost"],
      tasks: [
        task("pin", "2026-11-18T07:00:00Z", "2026-11-18T08:00:00Z", {
          pinned: true,
        }),
        task("done", "2026-11-18T07:00:00Z", "2026-11-18T08:00:00Z", {
          done: true,
        }),
        task("none", null, null),
        task("future", "2026-11-18T13:00:00Z", "2026-11-18T14:00:00Z"),
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
    expect(result.moves[0].to.end.getTime()).toBeLessThanOrEqual(
      result.moves[1].to.start.getTime()
    );
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
          start: d("2026-11-18T09:15:00Z"),
          end: d("2026-11-18T10:15:00Z"),
        },
      ],
    });
    // the other task's block is respected; the moved task's own is not
    expect(result.moves[0].to.start.getTime()).toBeGreaterThanOrEqual(
      d("2026-11-18T10:15:00Z").getTime()
    );
  });
});
