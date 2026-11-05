/**
 * Habit presence in the open app (additions-4/habits-quit HANDOFF §4): the
 * corner grows into an island at a habit's time, at a Quit milestone, and for
 * the evening check-in. This module only decides which island, if any, is due
 * now. Pure: the host passes the clock, the zone, the data and what was
 * already shown.
 *
 * The rules are the server's (src/services/habits/presence.ts, used by the
 * push sweep), not a copy of them: the same 60-minute windows, the same
 * weekdays, the same "reached today or yesterday" milestone, the same
 * check-in count. Each island carries the push's tag, so the host can close
 * the push that said the same thing.
 */
import {
  MILESTONE_TIME,
  habitReminderDue,
  habitRunsToday,
  inPresenceWindow,
  localClock,
  milestoneToAnnounce,
  presenceTag,
} from "@/services/habits/presence";

/** At most one island in this long. */
export const ISLAND_GAP_MS = 20 * 60_000;

export interface PresenceSettings {
  habitReminders: boolean;
  habitCheckin: boolean;
  habitCheckinTime: string;
  habitMilestones: boolean;
  quietHours: boolean;
  quietStart: string;
  quietEnd: string;
  /** The general switches every notice obeys (preferences.ts). */
  reminders: boolean;
  channelInApp: boolean;
  digest: boolean;
}

export interface PresenceDo {
  id: string;
  title: string;
  /** "HH:MM" in the person's zone, or null for no set time. */
  at: string | null;
  /** 0 = Sunday; empty means every day. */
  daysOfWeek: readonly number[];
  doneToday: boolean;
  remindersEnabled: boolean;
  /** Days kept of the last fourteen, for the reminder's line. */
  of14: number;
}

/** A Quit habit with its summary (Pro only; the host passes none on Free). */
export interface PresenceQuit {
  id: string;
  title: string;
  remindersEnabled: boolean;
  currentStreak: number;
  lastMilestone: number | null;
  /** The current run's start; null before the person started. */
  streakStartedAt: string | null;
}

/** What was shown, kept per device. */
export interface PresenceMemory {
  seen: readonly string[];
  lastShownAt: number | null;
  /**
   * Set once the milestones standing at the first run were marked seen, so
   * an old milestone is not announced as news the first time the app opens.
   */
  seeded: boolean;
}

export const EMPTY_MEMORY: PresenceMemory = {
  seen: [],
  lastShownAt: null,
  seeded: false,
};

export type PresenceIsland =
  | {
      kind: "reminder";
      key: string;
      tag: string;
      habitId: string;
      title: string;
      body: string;
    }
  | {
      kind: "milestone";
      key: string;
      tag: string;
      habitId: string;
      title: string;
      body: string;
    }
  | { kind: "checkin"; key: string; tag: string; title: string; body: string };

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

const MILESTONE_FROM = minutesOf(MILESTONE_TIME) ?? 9 * 60;

/** The milestone a Quit habit may announce now, as the server picks it. */
function milestoneOf(q: PresenceQuit) {
  if (!q.remindersEnabled || !q.streakStartedAt) return null;
  return milestoneToAnnounce(q);
}

/** Per run: a new run may reach the same step again. */
const milestoneKey = (q: PresenceQuit, days: number) =>
  `ms:${q.id}:${days}:${q.streakStartedAt}`;

/** The island due now, or null. Milestone first, then a reminder, then the check-in. */
export function nextIsland(i: PresenceInput): PresenceIsland | null {
  const s = i.settings;
  if (i.busy) return null;
  // The switches every in-app notice obeys: nothing interrupts with
  // Reminders off, In the app off, or a daily digest instead of a stream.
  if (!s.reminders || !s.channelInApp || s.digest) return null;
  const nowMs = i.now.getTime();
  if (i.memory.lastShownAt && nowMs - i.memory.lastShownAt < ISLAND_GAP_MS)
    return null;
  const clock = localClock(i.now, i.timeZone);
  if (inQuiet(s, clock.minutes)) return null;
  const seen = new Set(i.memory.seen);

  // In the morning, as the push: never a milestone at night.
  if (s.habitMilestones && clock.minutes >= MILESTONE_FROM) {
    for (const q of i.quits) {
      const days = milestoneOf(q);
      if (days === null) continue;
      const key = milestoneKey(q, days);
      if (seen.has(key)) continue;
      return {
        kind: "milestone",
        key,
        tag: presenceTag({
          kind: "milestone",
          habitId: q.id,
          dayKey: clock.dayKey,
          days,
        }),
        habitId: q.id,
        title: `${STEP_WORDS[days] ?? `${days} days`} without ${q.title.toLowerCase()}`,
        body: `${days} ${days === 1 ? "day" : "days"} in.`,
      };
    }
  }

  if (s.habitReminders) {
    for (const h of i.dos) {
      if (!h.remindersEnabled) continue;
      if (!habitReminderDue(h, clock, h.doneToday)) continue;
      const tag = presenceTag({
        kind: "reminder",
        habitId: h.id,
        dayKey: clock.dayKey,
      });
      if (seen.has(tag)) continue;
      return {
        kind: "reminder",
        key: tag,
        tag,
        habitId: h.id,
        title: `${h.title}, ${h.at}`,
        body: `Your slot starts now · ${h.of14} of 14`,
      };
    }
  }

  if (s.habitCheckin && inPresenceWindow(s.habitCheckinTime, clock)) {
    // The server's count: Do habits that run today, remind and are open,
    // plus the Quit habits that remind (Pro only; none are passed on Free).
    const open =
      i.dos.filter(
        (h) =>
          h.remindersEnabled &&
          habitRunsToday(h.daysOfWeek, clock) &&
          !h.doneToday
      ).length + i.quits.filter((q) => q.remindersEnabled).length;
    const tag = presenceTag({
      kind: "checkin",
      habitId: null,
      dayKey: clock.dayKey,
    });
    if (open > 0 && !seen.has(tag))
      return {
        kind: "checkin",
        key: tag,
        tag,
        title: "Evening check-in",
        body: `${open} ${open === 1 ? "habit" : "habits"} · takes ten seconds`,
      };
  }
  return null;
}

/**
 * The first run on a device: every milestone that could be announced now is
 * marked seen without showing it, so opening the app is not "news" about a
 * milestone the person already knows.
 */
export function seedMemory(
  m: PresenceMemory,
  quits: readonly PresenceQuit[]
): PresenceMemory {
  if (m.seeded) return m;
  const keys = quits.flatMap((q) => {
    const days = milestoneOf(q);
    return days === null ? [] : [milestoneKey(q, days)];
  });
  return { ...m, seen: [...m.seen, ...keys].slice(-200), seeded: true };
}

/** Record that an island was shown. */
export function rememberShown(
  m: PresenceMemory,
  key: string,
  nowMs: number
): PresenceMemory {
  const seen = [...m.seen.filter((k) => k !== key), key].slice(-200);
  return { ...m, seen, lastShownAt: nowMs };
}

/** Parse what the device kept; anything unreadable starts empty. */
export function readMemory(raw: string | null): PresenceMemory {
  if (!raw) return EMPTY_MEMORY;
  try {
    const v = JSON.parse(raw) as Partial<PresenceMemory>;
    return {
      seen: Array.isArray(v.seen)
        ? v.seen.filter((k): k is string => typeof k === "string")
        : [],
      lastShownAt: typeof v.lastShownAt === "number" ? v.lastShownAt : null,
      seeded: v.seeded === true,
    };
  } catch {
    return EMPTY_MEMORY;
  }
}

/**
 * The check-in times on offer: half hours from 18:00 to 23:30, plus the
 * stored one when it is not among them (set elsewhere, or an older default),
 * so the control always shows what is saved.
 */
export function checkinTimeOptions(current: string): [string, string][] {
  const out = Array.from({ length: 12 }, (_, i) => {
    const m = 18 * 60 + i * 30;
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${m % 60 ? "30" : "00"}`;
  });
  if (/^\d{2}:\d{2}$/.test(current) && !out.includes(current))
    out.push(current);
  return out.sort().map((v) => [v, v]);
}
