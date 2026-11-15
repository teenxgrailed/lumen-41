import type { V3Task } from "@/lib/needt3/map";

import { type ScheduleItem, hourAt } from "./derive";

/**
 * HOME V2: the one "Now" card. A pure pick, so the rule is testable and the
 * screen only draws it.
 *
 * The rule, in this order (first that has a candidate wins):
 *  0. `highlight` - today's highlight, when set and not done: the person's own
 *                one thing becomes "Now". Skip falls through to the rest;
 *  1. `now`    - something timed is running right now (an event or a placed
 *                task whose [start, start + length) holds the clock);
 *  2. `next`   - the next timed task later today, or an event that starts
 *                within the hour (a later event does not outrank open tasks);
 *  3. `anytime`- today's first open task with no hour;
 *  4. `now`    - a task placed earlier today that is still open (its hour
 *                passed); today still outranks overdue;
 *  5. `late`   - the oldest overdue task (it outranks an event that is more
 *                than an hour away, but never today's own open tasks);
 *  6. `next`   - a later event today, only when nothing else is open.
 * Skip works on any pick (task or event): the key goes into the skipped list
 * and the card moves on; an event's key is scoped to the day.
 * Open tasks only; a done item is never the pick.
 */

/** An event this close counts as "next" ahead of open tasks. */
export const SOON_HOURS = 1;

export type NowKind = "highlight" | "now" | "next" | "anytime" | "late";

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
  return pickOnce({ ...o, skipped: [] });
}

/** The key Skip stores for an event: scoped to the day, so it expires with it. */
export const eventSkipKey = (today: string, key: string) => `${today}:${key}`;

interface PickNowInput {
  /** Today's timed items: events and placed tasks (`scheduleItems`). */
  schedule: readonly ScheduleItem[];
  /** Today's open tasks, in the day's order. */
  dayOpen: readonly V3Task[];
  /** Open overdue tasks, oldest first. */
  lateOpen: readonly V3Task[];
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
        o.lateOpen.some((t) => t.id !== hl.id) ||
        o.schedule.some((i) => i.event),
      skipKey: hl.id,
    };
  }
  const byId = new Map(o.dayOpen.map((t) => [t.id, t]));
  const skippable = (id: string | null) => !!id && skipped.includes(id);

  // 1-2: the timed day. A task row counts only while it is in today's open
  // list (a task just ticked stays there until its row folds, so the card
  // holds still); an event is always a candidate.
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

  const running = timed.find(
    (s) => s.at <= o.nowHour && o.nowHour < s.at + s.len / 60
  );
  // An event wins the card only while it runs or when it starts within the
  // hour; a later one (an evening dinner) must not hide today's open tasks.
  const ahead = timed.find(
    (s) => s.at > o.nowHour && (s.task || s.at - o.nowHour <= SOON_HOURS)
  );
  const laterEvent = timed.find((s) => s.event && s.at > o.nowHour);

  const untimed = o.dayOpen.filter(
    (t) => hourAt(t, o.today) == null && !skippable(t.id)
  );
  const late = o.lateOpen.filter((t) => !skippable(t.id));

  const pick = (kind: NowKind, s: Slot): NowPick => {
    const others =
      timed.filter((x) => x !== s).length +
      untimed.filter((t) => t !== s.task).length +
      late.filter((t) => t !== s.task).length;
    return {
      kind,
      task: s.task,
      event: s.event,
      at: s.at,
      canSkip: others > 0,
      skipKey: s.event ? eventSkipKey(o.today, s.event.key) : s.task!.id,
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
      canSkip: untimed.length + late.length + timed.length > 1,
      skipKey: untimed[0].id,
    };
  }
  // A task placed earlier today that is still open (its hour passed): today
  // still outranks overdue, so it is "now" in the only sense left.
  const missed = [...timed].reverse().find((s) => s.task);
  if (missed) return pick("now", missed);
  // Overdue outranks an event that is more than an hour away.
  if (late[0]) {
    return {
      kind: "late",
      task: late[0],
      event: null,
      at: null,
      canSkip: late.length + timed.length > 1,
      skipKey: late[0].id,
    };
  }
  if (laterEvent) return pick("next", laterEvent);
  return null;
}

/**
 * The Now card's own time chip: the kicker of a "next" pick already says
 * "Next \u00b7 13:00", so the card must not repeat it.
 */
export const nowCardTime = <T extends { time?: string }>(
  card: T,
  kind: NowKind
): T => (kind === "next" ? { ...card, time: undefined } : card);

/** The card's kicker: what the person is looking at, in two words. */
export function nowKicker(p: NowPick): string {
  if (p.kind === "highlight") return "Highlight";
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
