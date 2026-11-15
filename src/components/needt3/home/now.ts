import type { V3Task } from "@/lib/needt3/map";

import { type ScheduleItem, hourAt } from "./derive";

/**
 * HOME V2: the one "Now" card. A pure pick, so the rule is testable and the
 * screen only draws it.
 *
 * The rule, in this order (first that has a candidate wins):
 *  0. `highlight` - today's highlight, when set and not done: the person's own
 *                one thing becomes "Now". Skip falls through to the rest;
 *  1. `now`/`next` - a calendar event that is running, or starts within
 *                `SOON_MINUTES` (15);
 *  2. `now`    - the task in the current time slot: a placed task whose
 *                [start, start + length) holds the clock;
 *  3. `next`   - the next scheduled TASK: the nearest timed task after now;
 *  4. `anytime`- today's first open task with no hour;
 *  5. `now`    - a task placed earlier today that is still open (its hour
 *                passed), the last one;
 *  6. `next`   - a later event (not running, not within 15 min), only when no
 *                task is open today.
 * An overdue task from a past day never takes the card: it has its own row
 * under the day. Skip works on any pick (task or event): the key goes into
 * the skipped list and the card moves on; an event's key is scoped to the day.
 * Open tasks only; a done item is never the pick.
 */

/** An event this close (minutes) counts as "next" ahead of the current slot. */
export const SOON_MINUTES = 15;

export type NowKind = "highlight" | "now" | "next" | "anytime";

export interface NowPick {
  kind: NowKind;
  /** The task, or null when the pick is an event. */
  task: V3Task | null;
  /** The event row (from `scheduleItems`), or null when the pick is a task. */
  event: ScheduleItem | null;
  /** Decimal hour it starts, when it has one. */
  at: number | null;
  /** More candidates exist, so Skip has somewhere to go. */
  canSkip: boolean;
  /** What Skip stores: the task id, or the event's day-scoped key. */
  skipKey: string;
  /** Every candidate had been skipped, so the pick came round again. */
  wrapped?: boolean;
}

interface Slot {
  at: number;
  len: number;
  task: V3Task | null;
  event: ScheduleItem | null;
}

export function pickNow(o: PickNowInput): NowPick | null {
  // Skip walks the candidates; when every one has been passed over the card
  // starts again from the first (a skipped list never leaves it empty).
  const first = pickOnce(o);
  if (first || !o.skipped?.length) return first;
  // `wrapped`: the stored skipped list is spent, so the next Skip must start
  // a new list instead of appending to it (or Skip would stick on this pick).
  const again = pickOnce({ ...o, skipped: [] });
  return again && { ...again, wrapped: true };
}

/** The key Skip stores for an event: scoped to the day, so it expires with it. */
export const eventSkipKey = (today: string, key: string) => `${today}:${key}`;

interface PickNowInput {
  /** Today's timed items: events and placed tasks (`scheduleItems`). */
  schedule: readonly ScheduleItem[];
  /** Today's open tasks, in the day's order. */
  dayOpen: readonly V3Task[];
  nowHour: number;
  today: string;
  skipped?: readonly string[];
  /**
   * The day's highlight when one is set (the person's own pick, Maksym's
   * rule of 15.11). Open and not skipped, it is the pick ahead of everything.
   */
  highlight?: V3Task | null;
}

function pickOnce(o: PickNowInput): NowPick | null {
  const skipped = o.skipped ?? [];
  const hl = o.highlight;
  if (hl && !hl.done && !skipped.includes(hl.id)) {
    return {
      kind: "highlight",
      task: hl,
      event: null,
      at: hourAt(hl, o.today),
      canSkip:
        o.dayOpen.some((t) => t.id !== hl.id) ||
        o.schedule.some((i) => i.event && i.at + i.len / 60 > o.nowHour),
      skipKey: hl.id,
    };
  }
  const byId = new Map(o.dayOpen.map((t) => [t.id, t]));
  const skippable = (id: string | null) => !!id && skipped.includes(id);

  // The timed day. A task row counts only while it is in today's open list (a
  // task just ticked stays there until its row folds, so the card holds
  // still); an event is always a candidate.
  const timed: Slot[] = [];
  for (const it of o.schedule) {
    if (it.event) {
      if (skippable(eventSkipKey(o.today, it.key))) continue;
      timed.push({ at: it.at, len: it.len, task: null, event: it });
      continue;
    }
    const t = it.id ? byId.get(it.id) : undefined;
    if (!t || skippable(t.id)) continue;
    timed.push({ at: it.at, len: it.len, task: t, event: null });
  }
  timed.sort((a, b) => a.at - b.at);

  const soon = SOON_MINUTES / 60;
  const runs = (s: Slot) => s.at <= o.nowHour && o.nowHour < s.at + s.len / 60;
  // A calendar event wins the card while it runs or when it starts within 15
  // minutes (one starting soon first, else the one that began last); then the task in the current slot; then
  // the next timed task.
  // Among them one starting soon wins; else the running event that began last.
  const startsSoon = timed.find(
    (s) => s.event && s.at > o.nowHour && s.at - o.nowHour <= soon
  );
  const running = timed.filter((s) => s.event && runs(s));
  const eventNow = startsSoon ?? running[running.length - 1];
  const taskNow = timed.find((s) => s.task && runs(s));
  const ahead = timed.find((s) => s.task && s.at > o.nowHour);
  const laterEvent = timed.find((s) => s.event && s.at > o.nowHour);

  const untimed = o.dayOpen.filter(
    (t) => hourAt(t, o.today) == null && !skippable(t.id)
  );

  const pick = (kind: NowKind, s: Slot): NowPick => {
    const others =
      timed.filter((x) => x !== s).length +
      untimed.filter((t) => t !== s.task).length;
    return {
      kind,
      task: s.task,
      event: s.event,
      at: s.at,
      canSkip: others > 0,
      skipKey: s.event ? eventSkipKey(o.today, s.event.key) : s.task!.id,
    };
  };

  if (eventNow)
    return pick(eventNow.at <= o.nowHour ? "now" : "next", eventNow);
  if (taskNow) return pick("now", taskNow);
  if (ahead) return pick("next", ahead);
  if (untimed[0]) {
    return {
      kind: "anytime",
      task: untimed[0],
      event: null,
      at: null,
      canSkip: untimed.length > 1,
      skipKey: untimed[0].id,
    };
  }
  // A task placed earlier today that is still open (its hour passed): it is
  // today's own, so it is "now" in the only sense left.
  const missed = [...timed].reverse().find((s) => s.task);
  if (missed) return pick("now", missed);
  if (laterEvent) return pick("next", laterEvent);
  return null;
}

/**
 * The Now card's own time chip: the kicker of a "next" pick already says
 * "Next · 13:00", so the card must not repeat it.
 */
export const nowCardTime = <T extends { time?: string }>(
  card: T,
  kind: NowKind
): T => (kind === "next" ? { ...card, time: undefined } : card);

/** The card's kicker: what the person is looking at, in two words. */
export function nowKicker(p: NowPick): string {
  if (p.kind === "highlight") return "Highlight";
  if (p.kind === "now") return "Now";
  if (p.kind === "next" && p.at != null) return `Next · ${hhmm(p.at)}`;
  return "Next";
}

export const hhmm = (h: number) => {
  const m = Math.round(h * 60);
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** Overdue row copy: "3 overdue" (one count, one word). */
export const overdueLabel = (n: number) => `${n} overdue`;

/** A task whose slot ended is not "missed" until this many minutes later. */
export const MISSED_GRACE_MIN = 60;

/** A placed task with no estimate is read as half an hour long. */
const DEFAULT_LEN_MIN = 30;

/**
 * Today's open tasks whose time slot has already passed and that are not
 * done ("morning tasks past and not done"). A fixed-time task stays where it
 * is, so it is not offered a new slot. Pure: `nowHour` is the person's clock.
 */
export function missedToday(
  dayOpen: readonly V3Task[],
  today: string,
  nowHour: number
): V3Task[] {
  return dayOpen.filter((t) => {
    // only what Reschedule can move: auto-scheduled, open, not held or running
    if (t.done || t.isFixed || !t.auto || t.status === "in_progress")
      return false;
    const at = hourAt(t, today);
    if (at == null) return false;
    // for an hour after its slot a task is just "earlier today"
    return (
      at +
        (t.estimatedMinutes || DEFAULT_LEN_MIN) / 60 +
        MISSED_GRACE_MIN / 60 <=
      nowHour
    );
  });
}

/** The line over them: "2 tasks from earlier today". */
export const missedLabel = (n: number) =>
  `${n} ${n === 1 ? "task" : "tasks"} from earlier today`;
