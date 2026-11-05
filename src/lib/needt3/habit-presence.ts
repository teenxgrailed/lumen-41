/**
 * Habit presence in the app (additions-4/habits-quit HANDOFF §4): the corner
 * grows into an island at a habit's time, at a Quit milestone, and for the
 * evening check-in. Nothing arrives beside it; this module only decides
 * which island, if any, is due now. Pure: the host passes the clock, the
 * zone, the data and what was already shown.
 *
 * The server pushes the same moments to closed apps (presence-sweep, #612);
 * this is the open app's half, and keeps its own record of what it showed.
 */
import { formatInTimeZone } from "@/lib/date-utils";

import { QUIT_STEPS } from "./habits-quit";

/** At most one island in this long. */
export const ISLAND_GAP_MS = 20 * 60_000;
/** A reminder shows within this long after the habit's time. */
const REMINDER_WINDOW_MIN = 30;
/** "Later" brings the reminder back once, this much later. */
export const LATER_MS = 30 * 60_000;

export interface PresenceSettings {
  habitReminders: boolean;
  habitCheckin: boolean;
  habitCheckinTime: string;
  habitMilestones: boolean;
  quietHours: boolean;
  quietStart: string;
  quietEnd: string;
}

export interface PresenceDo {
  id: string;
  title: string;
  /** "HH:MM" in the person's zone, or null for no set time. */
  at: string | null;
  keptToday: boolean;
  remindersEnabled: boolean;
  /** Days kept of the last fourteen, for the reminder's line. */
  of14: number;
}

export interface PresenceQuit {
  id: string;
  title: string;
  /** The current run's start: the last slip, or the quit date. */
  runStart: string | null;
  best: number;
}

/** What was shown, kept per device. */
export interface PresenceMemory {
  seen: readonly string[];
  /** Key → when a snoozed reminder may come back (epoch ms). */
  later: Readonly<Record<string, number>>;
  lastShownAt: number | null;
}

export const EMPTY_MEMORY: PresenceMemory = {
  seen: [],
  later: {},
  lastShownAt: null,
};

export type PresenceIsland =
  | {
      kind: "reminder";
      key: string;
      habitId: string;
      title: string;
      body: string;
      /** False once Later was used: it comes back once. */
      canLater: boolean;
    }
  | {
      kind: "milestone";
      key: string;
      habitId: string;
      title: string;
      body: string;
    }
  | { kind: "checkin"; key: string; title: string; body: string };

export interface PresenceInput {
  now: Date;
  timeZone: string;
  dos: readonly PresenceDo[];
  quits: readonly PresenceQuit[];
  settings: PresenceSettings;
  memory: PresenceMemory;
  /** The panel is open, a focus runs or the agent is mid-run. */
  busy: boolean;
}

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
};

/** Inside quiet hours (the window may cross midnight). */
export function inQuiet(s: PresenceSettings, nowMin: number): boolean {
  if (!s.quietHours) return false;
  const from = minutesOf(s.quietStart);
  const to = minutesOf(s.quietEnd);
  if (from === null || to === null || from === to) return false;
  return from < to
    ? nowMin >= from && nowMin < to
    : nowMin >= from || nowMin < to;
}

const STEP_WORDS: Record<number, string> = {
  1: "One day",
  3: "Three days",
  7: "One week",
  14: "Two weeks",
  30: "30 days",
  90: "90 days",
  365: "One year",
};

/** The last milestone the run has reached, or null. */
export function reachedStep(runStart: string | null, now: Date): number | null {
  if (!runStart) return null;
  const days = Math.floor(
    (now.getTime() - new Date(runStart).getTime()) / 86_400_000
  );
  let step: number | null = null;
  for (const s of QUIT_STEPS) if (s <= days) step = s;
  return step;
}

/** The island due now, or null. Milestone first, then a reminder, then the check-in. */
export function nextIsland(i: PresenceInput): PresenceIsland | null {
  if (i.busy) return null;
  const nowMs = i.now.getTime();
  if (i.memory.lastShownAt && nowMs - i.memory.lastShownAt < ISLAND_GAP_MS)
    return null;
  const nowMin = minutesOf(formatInTimeZone(i.now, i.timeZone, "HH:mm")) ?? 0;
  if (inQuiet(i.settings, nowMin)) return null;
  const day = formatInTimeZone(i.now, i.timeZone, "yyyy-MM-dd");
  const seen = new Set(i.memory.seen);

  if (i.settings.habitMilestones) {
    for (const q of i.quits) {
      const step = reachedStep(q.runStart, i.now);
      if (!step || !q.runStart) continue;
      const key = `ms:${q.id}:${step}:${q.runStart}`;
      if (seen.has(key)) continue;
      return {
        kind: "milestone",
        key,
        habitId: q.id,
        title: `${STEP_WORDS[step]} without ${q.title.toLowerCase()}`,
        body: `${step} ${step === 1 ? "day" : "days"}. Best run is ${Math.max(q.best, step)}.`,
      };
    }
  }

  if (i.settings.habitReminders) {
    for (const h of i.dos) {
      if (!h.at || !h.remindersEnabled || h.keptToday) continue;
      const at = minutesOf(h.at);
      if (at === null) continue;
      const key = `rem:${h.id}:${day}`;
      const later = i.memory.later[key];
      const due = later
        ? nowMs >= later && !seen.has(`${key}:again`)
        : !seen.has(key) && nowMin >= at && nowMin <= at + REMINDER_WINDOW_MIN;
      if (!due) continue;
      return {
        kind: "reminder",
        key: later ? `${key}:again` : key,
        habitId: h.id,
        title: `${h.title}, ${h.at}`,
        body: `Your slot starts now · ${h.of14} of 14`,
        canLater: !later,
      };
    }
  }

  if (i.settings.habitCheckin) {
    const at = minutesOf(i.settings.habitCheckinTime);
    const open = i.dos.filter((h) => !h.keptToday).length;
    const key = `ci:${day}`;
    if (at !== null && nowMin >= at && open > 0 && !seen.has(key))
      return {
        kind: "checkin",
        key,
        title: "Evening check-in",
        body: `${open} ${open === 1 ? "habit" : "habits"} · takes ten seconds`,
      };
  }
  return null;
}

/** Record that an island was shown. Keys older than a few days are dropped. */
export function rememberShown(
  m: PresenceMemory,
  key: string,
  nowMs: number
): PresenceMemory {
  const seen = [...m.seen.filter((k) => k !== key), key].slice(-200);
  return { ...m, seen, lastShownAt: nowMs };
}

/** "Later": the reminder comes back once, half an hour on. */
export function rememberLater(
  m: PresenceMemory,
  key: string,
  nowMs: number
): PresenceMemory {
  return { ...m, later: { ...m.later, [key]: nowMs + LATER_MS } };
}

/** Parse what the device kept; anything unreadable starts empty. */
export function readMemory(raw: string | null): PresenceMemory {
  if (!raw) return EMPTY_MEMORY;
  try {
    const v = JSON.parse(raw) as Partial<PresenceMemory>;
    return {
      seen: Array.isArray(v.seen)
        ? v.seen.filter((k) => typeof k === "string")
        : [],
      later:
        v.later && typeof v.later === "object"
          ? (v.later as Record<string, number>)
          : {},
      lastShownAt: typeof v.lastShownAt === "number" ? v.lastShownAt : null,
    };
  } catch {
    return EMPTY_MEMORY;
  }
}
