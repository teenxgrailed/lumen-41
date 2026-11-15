import type { V3Task } from "@/lib/needt3/map";

import { type ScheduleItem, hourAt } from "./derive";

/**
 * HOME V2: the one "Now" card. A pure pick, so the rule is testable and the
 * screen only draws it.
 *
 * The rule, in this order (first that has a candidate wins):
 *  1. `now`    - something timed is running right now (an event or a placed
 *                task whose [start, start + length) holds the clock);
 *  2. `next`   - the next timed thing later today, event or task;
 *  3. `anytime`- today's first open task with no hour;
 *  4. `now`    - a task placed earlier today that is still open (its hour
 *                passed); today still outranks overdue;
 *  5. `late`   - the oldest overdue task, only when nothing above exists
 *                (overdue lives in its own row, it never outranks today).
 * Open tasks only; a done item is never the pick. Skip moves a TASK pick to
 * the next one; an event cannot be skipped (it happens at its time anyway).
 */

export type NowKind = "now" | "next" | "anytime" | "late";

export interface NowPick {
  kind: NowKind;
  /** The task, or null when the pick is an event. */
  task: V3Task | null;
  /** The event row (from `scheduleItems`), or null when the pick is a task. */
  event: ScheduleItem | null;
  /** Decimal hour it starts, when it has one. */
  at: number | null;
  /** More candidates exist, so Skip has somewhere to go (tasks only). */
  canSkip: boolean;
}

interface Slot {
  at: number;
  len: number;
  task: V3Task | null;
  event: ScheduleItem | null;
}

export function pickNow(o: {
  /** Today's timed items: events and placed tasks (`scheduleItems`). */
  schedule: readonly ScheduleItem[];
  /** Today's open tasks, in the day's order. */
  dayOpen: readonly V3Task[];
  /** Open overdue tasks, oldest first. */
  lateOpen: readonly V3Task[];
  nowHour: number;
  today: string;
  skipped?: readonly string[];
}): NowPick | null {
  const skipped = o.skipped ?? [];
  const byId = new Map(o.dayOpen.map((t) => [t.id, t]));
  const skippable = (id: string | null) => !!id && skipped.includes(id);

  // 1-2: the timed day. A task row counts only while it is in today's open
  // list (a task just ticked stays there until its row folds, so the card
  // holds still); an event is always a candidate.
  const timed: Slot[] = [];
  for (const it of o.schedule) {
    if (it.event) {
      timed.push({ at: it.at, len: it.len, task: null, event: it });
      continue;
    }
    const t = it.id ? byId.get(it.id) : undefined;
    if (!t || skippable(t.id)) continue;
    timed.push({ at: it.at, len: it.len, task: t, event: null });
  }
  timed.sort((a, b) => a.at - b.at);

  const running = timed.find(
    (s) => s.at <= o.nowHour && o.nowHour < s.at + s.len / 60
  );
  const ahead = timed.find((s) => s.at > o.nowHour);

  const untimed = o.dayOpen.filter(
    (t) => hourAt(t, o.today) == null && !skippable(t.id)
  );
  const late = o.lateOpen.filter((t) => !skippable(t.id));

  const pick = (kind: NowKind, s: Slot): NowPick => {
    const tasksLeft =
      timed.filter((x) => x.task && x !== s).length +
      untimed.filter((t) => t !== s.task).length +
      late.filter((t) => t !== s.task).length;
    return {
      kind,
      task: s.task,
      event: s.event,
      at: s.at,
      canSkip: !!s.task && tasksLeft > 0,
    };
  };

  if (running) return pick("now", running);
  if (ahead) return pick("next", ahead);
  if (untimed[0]) {
    return {
      kind: "anytime",
      task: untimed[0],
      event: null,
      at: null,
      canSkip: untimed.length + late.length > 1,
    };
  }
  // A task placed earlier today that is still open (its hour passed): today
  // still outranks overdue, so it is "now" in the only sense left.
  const missed = [...timed].reverse().find((s) => s.task);
  if (missed) return pick("now", missed);
  if (late[0]) {
    return {
      kind: "late",
      task: late[0],
      event: null,
      at: null,
      canSkip: late.length > 1,
    };
  }
  return null;
}

/** The card's kicker: what the person is looking at, in two words. */
export function nowKicker(p: NowPick): string {
  if (p.kind === "now") return "Now";
  if (p.kind === "late") return "Overdue";
  if (p.kind === "next" && p.at != null) return `Next · ${hhmm(p.at)}`;
  return "Next";
}

export const hhmm = (h: number) => {
  const m = Math.round(h * 60);
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** Overdue row copy: "3 overdue" (one count, one word). */
export const overdueLabel = (n: number) => `${n} overdue`;
