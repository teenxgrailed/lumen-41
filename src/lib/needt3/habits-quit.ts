/**
 * Quit habits on the client: what the cards, the detail screen and the pull
 * flow draw (additions-4/habits-quit). Pure: the caller passes `now` and the
 * person's time zone, so a test and a render agree.
 *
 * The run is a run, not a ratio (HANDOFF "where this departs from PORT.md"):
 * time since the last slip, or since the quit date. A slip resets only the
 * current run; best run and clean-in-all come from the server's summary and
 * never go down. No copy here counts misses.
 */
import { formatInTimeZone } from "@/lib/date-utils";

/** Whether this account sees Quit: on, the locked Pro card, or nothing. */
export type QuitGate = "on" | "upgrade" | "off";

/** The `quit` field of GET /api/habits; anything else is "off". */
export function readQuitGate(value: unknown): QuitGate {
  return value === "on" || value === "upgrade" ? value : "off";
}

export type HabitEventType = "URGE" | "RESISTED" | "RELAPSE" | "MILESTONE";

/** A row of `GET /api/habits/:id/events`. */
export interface HabitEvent {
  id: string;
  habitId: string;
  type: HabitEventType;
  at: string;
  tag: string | null;
  intensity: number | null;
  note: string | null;
}

/** `GET /api/habits/:id/quit-summary`, the fields the screens read. */
export interface QuitSummary {
  started: boolean;
  streakStartedAt: string | null;
  currentStreak: number;
  bestStreak: number;
  totalCleanDays: number;
  nextMilestone: { days: number; daysLeft: number } | null;
  counts: Record<HabitEventType, number>;
}

/** Milestones, in days. Each fires at most once per run (server side). */
export const QUIT_STEPS = [1, 3, 7, 14, 30, 90, 365] as const;

/** One breathing period: in 5.2 s, out 5.2 s (HANDOFF §2). */
export const BREATH_HALF_MS = 5200;
/** The breath step lasts a minute. */
export const BREATH_MS = 60_000;

/** What set it off: the stored tag and what the chip says. */
export const URGE_TAGS = [
  ["boredom", "Boredom"],
  ["stress", "Stress"],
  ["night", "Night"],
  ["phone_in_bed", "Phone in bed"],
  ["other", "Other…"],
] as const;

export type UrgeTag = (typeof URGE_TAGS)[number][0];

/** Marks the note of an urge that went on to the assistant. */
export const TALKED_NOTE = "talked";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export interface RunParts {
  days: number;
  hours: number;
  minutes: number;
}

/** Time since `start` as whole days, hours and minutes (never negative). */
export function runParts(start: string | Date | null, now: Date): RunParts {
  const from = start ? new Date(start).getTime() : now.getTime();
  const ms = Math.max(0, now.getTime() - from);
  return {
    days: Math.floor(ms / DAY),
    hours: Math.floor((ms % DAY) / HOUR),
    minutes: Math.floor((ms % HOUR) / MINUTE),
  };
}

/** "1 d 20 h", "21 h 40 m", "12 m": the two largest units that are set. */
export function formatSpan(ms: number): string {
  const total = Math.max(0, ms);
  const d = Math.floor(total / DAY);
  const h = Math.floor((total % DAY) / HOUR);
  const m = Math.floor((total % HOUR) / MINUTE);
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} m`;
  return `${m} m`;
}

export interface MilestoneView {
  /** The next milestone in days, or null past a year. */
  next: number | null;
  /** The milestone already behind (0 before the first). */
  prev: number;
  /** Progress from `prev` to `next`, 0 to 100. */
  pct: number;
  /** Time until `next`, as `formatSpan` words. */
  left: string | null;
}

/** Where the current run stands between two milestones. */
export function milestoneView(
  start: string | Date | null,
  now: Date
): MilestoneView {
  const elapsed = start
    ? Math.max(0, now.getTime() - new Date(start).getTime())
    : 0;
  const days = elapsed / DAY;
  const next = QUIT_STEPS.find((s) => s > days) ?? null;
  const prev = [...QUIT_STEPS].reverse().find((s) => s <= days) ?? 0;
  if (next === null) return { next: null, prev, pct: 100, left: null };
  const pct = Math.min(
    100,
    Math.max(0, Math.round(((days - prev) / (next - prev)) * 100))
  );
  return { next, prev, pct, left: formatSpan(next * DAY - elapsed) };
}

/** The label under a milestone step: "14d", or "1y" for a year. */
export const stepLabel = (days: number) => (days < 365 ? `${days}d` : "1y");

const MAP_WEEKS = 8;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
/** Below this many urges the map is hidden: a pattern needs a few. */
export const MAP_MIN_URGES = 5;

export interface UrgeMap {
  /** 7 rows (Monday first) of 12 two-hour blocks, each 0 to 4. */
  levels: number[][];
  total: number;
  /** One sentence on when it pulls, or null when nothing stands out. */
  note: string | null;
}

/** Urges over the last eight weeks by weekday and two-hour block. */
export function urgeMap(
  events: readonly HabitEvent[],
  now: Date,
  timeZone: string
): UrgeMap {
  const counts = WEEKDAYS.map(() => new Array<number>(12).fill(0));
  const from = now.getTime() - MAP_WEEKS * 7 * DAY;
  let total = 0;
  for (const e of events) {
    if (e.type !== "URGE") continue;
    const at = new Date(e.at);
    if (at.getTime() < from || at.getTime() > now.getTime()) continue;
    // ISO weekday 1 (Monday) to 7 (Sunday).
    const day = Number(formatInTimeZone(at, timeZone, "i")) - 1;
    const block = Math.floor(Number(formatInTimeZone(at, timeZone, "H")) / 2);
    counts[day][block] += 1;
    total += 1;
  }
  const peak = Math.max(0, ...counts.flat());
  const levels = counts.map((row) =>
    row.map((n) => (n === 0 || peak === 0 ? 0 : Math.ceil((n / peak) * 4)))
  );
  return {
    levels,
    total,
    note: total >= MAP_MIN_URGES ? mapNote(counts) : null,
  };
}

function mapNote(counts: number[][]): string | null {
  const byBlock = new Array<number>(12).fill(0);
  counts.forEach((row) => row.forEach((n, i) => (byBlock[i] += n)));
  const total = byBlock.reduce((a, b) => a + b, 0);
  if (!total) return null;
  // The two-hour block where most pulls start, said as "after HH:00".
  let best = 0;
  byBlock.forEach((n, i) => {
    if (n > byBlock[best]) best = i;
  });
  const byDay = counts.map((row) => row.reduce((a, b) => a + b, 0));
  const top = Math.max(...byDay);
  const days = WEEKDAYS.filter((_, i) => byDay[i] === top && top > 0);
  const hour = String(best * 2).padStart(2, "0");
  const when = `Most pulls come after ${hour}:00`;
  if (days.length === 0 || days.length > 2) return `${when}.`;
  const named = days.map((d) => FULL_DAY[d]).join(" and ");
  return `${when}, hardest on ${named}.`;
}

const FULL_DAY: Record<(typeof WEEKDAYS)[number], string> = {
  Mon: "Mondays",
  Tue: "Tuesdays",
  Wed: "Wednesdays",
  Thu: "Thursdays",
  Fri: "Fridays",
  Sat: "Saturdays",
  Sun: "Sundays",
};

/** The weekday labels of the map's rows. */
export const MAP_ROWS = WEEKDAYS.map((d) => d.slice(0, 2));

export type PullOutcome = "Held" | "Talked it through" | "Slipped" | null;

export interface PullLogRow {
  id: string;
  /** "23:40" today, "Mon 22:10" earlier in the week. */
  when: string;
  tag: string | null;
  strength: number | null;
  outcome: PullOutcome;
}

/** An urge's outcome is the first held or slip logged within this long of it. */
const OUTCOME_WINDOW_MS = 2 * HOUR;

/** The last seven days of pulls, newest first, each with how it ended. */
export function pullLog(
  events: readonly HabitEvent[],
  now: Date,
  timeZone: string
): PullLogRow[] {
  const from = now.getTime() - 7 * DAY;
  const today = formatInTimeZone(now, timeZone, "yyyy-MM-dd");
  const later = [...events]
    .filter((e) => e.type === "RESISTED" || e.type === "RELAPSE")
    .sort((a, b) => a.at.localeCompare(b.at));
  return events
    .filter((e) => e.type === "URGE" && new Date(e.at).getTime() >= from)
    .sort((a, b) => b.at.localeCompare(a.at))
    .map((u) => {
      const t = new Date(u.at).getTime();
      const end = later.find((e) => {
        const d = new Date(e.at).getTime() - t;
        return d >= 0 && d <= OUTCOME_WINDOW_MS;
      });
      const outcome: PullOutcome =
        end?.type === "RELAPSE"
          ? "Slipped"
          : u.note === TALKED_NOTE
            ? "Talked it through"
            : end?.type === "RESISTED"
              ? "Held"
              : null;
      const day = formatInTimeZone(u.at, timeZone, "yyyy-MM-dd");
      const time = formatInTimeZone(u.at, timeZone, "HH:mm");
      const tag = u.tag ?? end?.tag ?? null;
      return {
        id: u.id,
        when:
          day === today
            ? time
            : `${formatInTimeZone(u.at, timeZone, "EEE")} ${time}`,
        tag: tag ? tagLabel(tag) : null,
        strength: u.intensity ?? end?.intensity ?? null,
        outcome,
      };
    });
}

/** The chip label of a stored tag; a free-text tag reads as written. */
export function tagLabel(tag: string): string {
  const known = URGE_TAGS.find(([k]) => k === tag);
  return known ? known[1].replace("…", "") : tag;
}

/** Pulls started today, for the assistant's context line. */
export function pullsToday(
  events: readonly HabitEvent[],
  now: Date,
  timeZone: string
): number {
  const today = formatInTimeZone(now, timeZone, "yyyy-MM-dd");
  return events.filter(
    (e) =>
      e.type === "URGE" &&
      formatInTimeZone(e.at, timeZone, "yyyy-MM-dd") === today
  ).length;
}

const ORDINAL = ["1st", "2nd", "3rd"];
const ordinal = (n: number) => ORDINAL[n - 1] ?? `${n}th`;

/**
 * The line the assistant opens with when a pull does not pass ("Yes,
 * still"): what, how long without, how strong, why it started, and the
 * person's own reason, so they do not have to type any of it.
 */
export function assistantContext(input: {
  title: string;
  run: RunParts;
  tag: string | null;
  strength: number | null;
  pullsToday: number;
  reason: string | null;
  time: string;
}): string {
  const parts = [
    `${input.title}: ${input.run.days} d ${input.run.hours} h without.`,
    `It is ${input.time}, the ${ordinal(Math.max(1, input.pullsToday))} pull today`,
  ];
  const detail = [
    input.strength ? `strength ${input.strength} of 5` : null,
    input.tag ? tagLabel(input.tag).toLowerCase() : null,
  ].filter(Boolean);
  parts[1] += detail.length ? ` (${detail.join(", ")}).` : ".";
  if (input.reason) parts.push(`My reason: “${input.reason}”`);
  parts.push(
    "It has not passed. Help me through the next ten minutes, calmly and briefly."
  );
  return `${input.title} is pulling at me. ${parts.join(" ")}`;
}
