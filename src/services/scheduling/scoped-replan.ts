import {
  type DemoHours,
  freeGapAfter,
  overlaps,
} from "@/services/onboarding/first-replan-demo";

import { formatInTimeZone } from "@/lib/date-utils";

/**
 * A replan of only the tasks the caller names ("the 3 tasks from earlier
 * today"). Pure: the rows, the clock and the zone come in as arguments, so the
 * same input always gives the same moves. The scheduler itself is not run;
 * the free-gap search is the one the first-replan demo uses, and it treats
 * every other task block and calendar event as busy time.
 */

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
};

export type Interval = { start: Date; end: Date };

export type ScopedReplanSkipReason =
  | "not_found"
  | "completed"
  | "pinned"
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

export function planScopedReplan(input: {
  /** The ids the caller asked for, in the order given (deduplicated here). */
  requestedIds: string[];
  /**
   * Every open task in the caller's scope that has a slot ending after the
   * start of the horizon (or is requested), the requested ones included. A
   * requested id missing from here is `not_found`: unknown, foreign, done or
   * archived.
   */
  tasks: ScopedReplanTask[];
  /** Calendar events: busy time that never moves. */
  events: Interval[];
  /** Scheduled blocks (chunks) of open tasks, with their task. */
  blocks: Array<Interval & { taskId: string }>;
  now: Date;
  zone: string;
  hours?: DemoHours | null;
}): ScopedReplanResult {
  const { now, zone, hours } = input;
  const tasks = input.tasks;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const skipped: ScopedReplanResult["skipped"] = [];
  const candidates: Array<{
    task: ScopedReplanTask;
    reason: ScopedReplanMove["reason"];
  }> = [];

  const seen = new Set<string>();
  const requested = input.requestedIds.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const requestedSet = new Set(requested);

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
    if (!task) {
      skipped.push({ taskId: id, reason: "not_found" });
    } else if (task.done) {
      skipped.push({ taskId: id, reason: "completed" });
    } else if (task.pinned) {
      skipped.push({ taskId: id, reason: "pinned" });
    } else if (!task.scheduledStart || !task.scheduledEnd) {
      skipped.push({ taskId: id, reason: "not_scheduled" });
    } else if (task.scheduledEnd.getTime() <= now.getTime()) {
      candidates.push({ task, reason: "missed" });
    } else if (
      fixedForOverlap.some((b) =>
        overlaps({ start: task.scheduledStart!, end: task.scheduledEnd! }, b)
      )
    ) {
      candidates.push({ task, reason: "overlaps" });
    } else {
      skipped.push({ taskId: id, reason: "not_missed" });
    }
  }

  // Deterministic order: earliest original slot first, then id.
  candidates.sort(
    (a, b) =>
      a.task.scheduledStart!.getTime() - b.task.scheduledStart!.getTime() ||
      a.task.id.localeCompare(b.task.id)
  );

  const movingIds = new Set(candidates.map((c) => c.task.id));
  // Busy: events, other blocks, and every task that is not moving (a skipped
  // requested task stays where it is, so it is an obstacle like any other).
  const busy: Interval[] = [
    ...input.events,
    ...input.blocks.filter((b) => !movingIds.has(b.taskId)),
    ...tasks.flatMap((t) =>
      !t.done && !movingIds.has(t.id) && t.scheduledStart && t.scheduledEnd
        ? [{ start: t.scheduledStart, end: t.scheduledEnd }]
        : []
    ),
  ];

  const moves: ScopedReplanMove[] = [];
  const unscheduled: ScopedReplanResult["unscheduled"] = [];
  for (const { task, reason } of candidates) {
    const slot = freeGapAfter({
      after: now,
      now,
      zone,
      hours,
      busy,
      minutes: task.minutes,
      bufferMinutes: 0,
    });
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
      from: { start: task.scheduledStart!, end: task.scheduledEnd! },
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
