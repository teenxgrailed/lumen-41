import { workingWindowsForRange } from "@/services/scheduling/capacity";

import {
  formatInTimeZone,
  fromZonedTime,
  startOfDayInTimeZone,
} from "@/lib/date-utils";
import { type WeekHours } from "@/lib/work-week";

/**
 * A replan of only the tasks the caller names ("the 3 tasks from earlier
 * today"). Pure: the rows, the clock and the zone come in as arguments, so the
 * same input always gives the same moves. The scheduler itself is not run.
 * Slots come from the person's real work week (their default WorkSchedule,
 * minus flexible-hours overrides), with every other task block, calendar
 * event and personal-time block as busy time and the scheduler's 15 minute
 * buffer around each.
 */

export const REPLAN_BUFFER_MINUTES = 15;
const STEP_MS = 15 * 60_000;
const HORIZON_DAYS = 22;

export type Interval = { start: Date; end: Date };

export type ScopedReplanTask = {
  id: string;
  title: string;
  scheduledStart: Date | null;
  scheduledEnd: Date | null;
  /** Minutes the task needs: its estimate, else its duration, else 30. */
  minutes: number;
  /** Pinned: `scheduleLocked` or `isFrozen`. Never moved. */
  pinned: boolean;
  /** Completed. Never moved, and not busy time. */
  done?: boolean;
  /** The caller's own task: assigned to them, or theirs and unassigned. */
  owned?: boolean;
  /** Latest of availableFrom, startDate, postponedUntil: never placed before. */
  notBefore?: Date | null;
  /** A dependency is still open. */
  blocked?: boolean;
  /** Follows its own WorkSchedule, not the default week. */
  ownHours?: boolean;
};

export type ScopedReplanBlock = Interval & {
  taskId: string;
  chunkCount?: number;
  isFrozen?: boolean;
};

/** A flexible-hours override on one day (`date` is yyyy-MM-dd in the person's zone). */
export type HoursOverride = {
  date: string;
  kind: "START_LATER" | "STOP_EARLY" | "BLOCK_HOURS" | "BLOCK_WHOLE_DAY";
  startTime: string | null;
  endTime: string | null;
};

export type ScopedReplanSkipReason =
  | "not_found"
  | "completed"
  | "pinned"
  | "split"
  | "blocked"
  | "own_hours"
  | "not_scheduled"
  | "not_missed";

export type ScopedReplanMove = {
  taskId: string;
  title: string;
  from: Interval;
  to: Interval;
  /** `missed`: its slot ended before now. `overlaps`: its slot sits on busy time. */
  reason: "missed" | "overlaps";
  /** "Missed at 08:30" / "Overlaps another block": the card's line. */
  explanation: string;
};

export type ScopedReplanResult = {
  moves: ScopedReplanMove[];
  skipped: Array<{ taskId: string; reason: ScopedReplanSkipReason }>;
  unscheduled: Array<{ taskId: string; title: string; reason: string }>;
};

export function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

const pad = (interval: Interval, minutes: number): Interval => ({
  start: new Date(interval.start.getTime() - minutes * 60_000),
  end: new Date(interval.end.getTime() + minutes * 60_000),
});

/** What a flexible-hours override takes out of its day, as busy time. */
export function overrideBusy(
  overrides: HoursOverride[],
  zone: string
): Interval[] {
  const at = (date: string, time: string) =>
    fromZonedTime(`${date}T${time}:00`, zone);
  return overrides.flatMap((o): Interval[] => {
    const dayStart = at(o.date, "00:00");
    const dayEnd = new Date(at(o.date, "00:00").getTime() + 24 * 3_600_000);
    switch (o.kind) {
      case "BLOCK_WHOLE_DAY":
        return [{ start: dayStart, end: dayEnd }];
      case "BLOCK_HOURS":
        return o.startTime && o.endTime
          ? [{ start: at(o.date, o.startTime), end: at(o.date, o.endTime) }]
          : [];
      case "START_LATER":
        return o.startTime
          ? [{ start: dayStart, end: at(o.date, o.startTime) }]
          : [];
      case "STOP_EARLY":
        return o.endTime ? [{ start: at(o.date, o.endTime), end: dayEnd }] : [];
    }
  });
}

/**
 * The first slot of `minutes` that starts on the quarter hour at or after
 * `floor`, sits inside one working window and keeps the buffer from every
 * busy interval. Null when three weeks hold none. Pure.
 */
export function findSlot(input: {
  windows: Interval[];
  busy: Interval[];
  floor: Date;
  minutes: number;
}): Interval | null {
  const length = input.minutes * 60_000;
  const padded = input.busy.map((b) => pad(b, REPLAN_BUFFER_MINUTES));
  const windows = [...input.windows].sort(
    (a, b) => a.start.getTime() - b.start.getTime()
  );
  for (const window of windows) {
    if (window.end <= input.floor) continue;
    let at = Math.max(window.start.getTime(), input.floor.getTime());
    at = Math.ceil(at / STEP_MS) * STEP_MS;
    while (at + length <= window.end.getTime()) {
      const slot = { start: new Date(at), end: new Date(at + length) };
      const hit = padded.find((b) => overlaps(slot, b));
      if (!hit) return slot;
      at =
        Math.ceil(Math.max(hit.end.getTime(), at + STEP_MS) / STEP_MS) *
        STEP_MS;
    }
  }
  return null;
}

export function planScopedReplan(input: {
  /** The ids the caller asked for, in the order given (deduplicated here). */
  requestedIds: string[];
  /**
   * Every open task in the caller's scope that has a slot ending after the
   * start of the horizon (or is requested), the requested ones included. A
   * requested id missing from here is `not_found`: unknown, foreign,
   * archived or trashed.
   */
  tasks: ScopedReplanTask[];
  /** Calendar events and personal time: busy time that never moves. */
  events: Interval[];
  /** Scheduled blocks (chunks) of open tasks, with their task. */
  blocks: ScopedReplanBlock[];
  /** The default week's working hours. */
  week: WeekHours;
  overrides?: HoursOverride[];
  now: Date;
  zone: string;
}): ScopedReplanResult {
  const { now, zone } = input;
  const tasks = input.tasks;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const skipped: ScopedReplanResult["skipped"] = [];
  const candidates: Array<{
    task: ScopedReplanTask;
    end: Date;
    reason: ScopedReplanMove["reason"];
  }> = [];

  const seen = new Set<string>();
  const requested = input.requestedIds.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const requestedSet = new Set(requested);
  const blocksOf = (id: string) => input.blocks.filter((b) => b.taskId === id);

  // What is fixed for the overlap test: everything outside the requested set.
  const fixedForOverlap: Interval[] = [
    ...input.events,
    ...input.blocks.filter((b) => !requestedSet.has(b.taskId)),
    ...tasks.flatMap((t) =>
      !t.done && !requestedSet.has(t.id) && t.scheduledStart && t.scheduledEnd
        ? [{ start: t.scheduledStart, end: t.scheduledEnd }]
        : []
    ),
  ];

  for (const id of requested) {
    const task = byId.get(id);
    if (!task || task.owned === false) {
      skipped.push({ taskId: id, reason: "not_found" });
      continue;
    }
    const own = blocksOf(id);
    if (task.done) {
      skipped.push({ taskId: id, reason: "completed" });
    } else if (task.pinned) {
      skipped.push({ taskId: id, reason: "pinned" });
    } else if (
      own.length > 1 ||
      own.some((b) => (b.chunkCount ?? 1) > 1 || b.isFrozen)
    ) {
      // Split over several blocks, or a block was pinned by hand: moving the
      // task would rewrite all of them.
      skipped.push({ taskId: id, reason: "split" });
    } else if (task.blocked) {
      skipped.push({ taskId: id, reason: "blocked" });
    } else if (task.ownHours) {
      skipped.push({ taskId: id, reason: "own_hours" });
    } else if (!task.scheduledStart || !task.scheduledEnd) {
      skipped.push({ taskId: id, reason: "not_scheduled" });
    } else {
      // Missed by when the last of its blocks ends.
      const end = new Date(
        Math.max(
          task.scheduledEnd.getTime(),
          ...own.map((b) => b.end.getTime())
        )
      );
      const slot = { start: task.scheduledStart, end };
      if (end.getTime() <= now.getTime()) {
        candidates.push({ task, end, reason: "missed" });
      } else if (fixedForOverlap.some((b) => overlaps(slot, b))) {
        candidates.push({ task, end, reason: "overlaps" });
      } else {
        skipped.push({ taskId: id, reason: "not_missed" });
      }
    }
  }

  // Deterministic order: earliest original slot first, then id.
  candidates.sort(
    (a, b) =>
      a.task.scheduledStart!.getTime() - b.task.scheduledStart!.getTime() ||
      a.task.id.localeCompare(b.task.id)
  );

  const movingIds = new Set(candidates.map((c) => c.task.id));
  // Busy: events, personal time, other blocks, overridden hours, and every
  // task that is not moving (a skipped requested task stays where it is, so it
  // is an obstacle like any other).
  const busy: Interval[] = [
    ...input.events,
    ...overrideBusy(input.overrides ?? [], zone),
    ...input.blocks.filter((b) => !movingIds.has(b.taskId)),
    ...tasks.flatMap((t) =>
      !t.done && !movingIds.has(t.id) && t.scheduledStart && t.scheduledEnd
        ? [{ start: t.scheduledStart, end: t.scheduledEnd }]
        : []
    ),
  ];
  const windows = workingWindowsForRange(
    input.week,
    startOfDayInTimeZone(now, zone),
    HORIZON_DAYS,
    zone
  );

  const moves: ScopedReplanMove[] = [];
  const unscheduled: ScopedReplanResult["unscheduled"] = [];
  for (const { task, end, reason } of candidates) {
    const floor = new Date(
      Math.max(now.getTime(), task.notBefore?.getTime() ?? 0)
    );
    const slot = findSlot({ windows, busy, floor, minutes: task.minutes });
    if (!slot) {
      unscheduled.push({
        taskId: task.id,
        title: task.title,
        reason: "No free slot in working hours in the next three weeks.",
      });
      continue;
    }
    // The next moved task must not land on this one.
    busy.push(slot);
    moves.push({
      taskId: task.id,
      title: task.title,
      from: { start: task.scheduledStart!, end },
      to: slot,
      reason,
      explanation:
        reason === "missed"
          ? `Missed at ${formatInTimeZone(task.scheduledStart!, zone, "HH:mm")}`
          : "Overlaps another block",
    });
  }
  return { moves, skipped, unscheduled };
}
