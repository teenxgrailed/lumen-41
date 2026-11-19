import { z } from "zod";

import {
  addDays as dateFnsAddDays,
  formatInTimeZone,
  newDate,
} from "@/lib/date-utils";

/**
 * Pure rules of the day plan (openspec finish-today-daily-planner, Stage 2).
 * No database, no clock: everything here takes its inputs, so each decision
 * D1..D4 can be tested on its own.
 */

export const DAY_PLAN_LIMITS = {
  /** D2: the person picks 3 to 10 tasks, default 5. */
  taskMin: 3,
  taskMax: 10,
  taskDefault: 5,
  /** D2: at most 3 main tasks, never more than the task limit. */
  mainMax: 3,
  /** D2: at most 5 hours of focus. */
  focusMin: 30,
  focusMax: 300,
  /** A task with no estimate counts as 30 minutes. */
  defaultEstimateMinutes: 30,
  /** D3: untouched for this long and a task goes to Someday. */
  staleDays: 14,
  /** A deadline this close keeps a stale task out of Someday. */
  protectedDeadlineDays: 14,
  /** D3: a Someday task is offered for the weekly cleanup after this. */
  cleanupAfterDays: 7,
  /** D2: the adaptive suggestion needs this many plan days. */
  suggestionMinDays: 14,
  /** A dismissed suggestion stays quiet for this long. */
  suggestionQuietDays: 14,
  /** The draft also looks at deadlines up to this many days after the date. */
  draftDeadlineDays: 3,
} as const;

export type DayPlanErrorCode =
  | "invalid_date"
  | "invalid_input"
  | "not_found"
  | "no_plan"
  | "day_closed"
  | "over_limit"
  | "over_budget"
  | "disabled"
  | "invalid_main"
  | "missing_resolutions"
  | "unknown_resolutions"
  | "overflow";

/** A refusal the HTTP layer turns into a status code and a body. */
export class DayPlanError extends Error {
  constructor(
    readonly code: DayPlanErrorCode,
    readonly status: number,
    message: string,
    readonly details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = "DayPlanError";
  }
}

/* ---------- dates ---------- */

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export const dateKeySchema = z
  .string()
  .regex(DATE_KEY, "date must be YYYY-MM-DD");

/** `YYYY-MM-DD` to the `@db.Date` value (UTC midnight), or null if invalid. */
export function dateFromKey(key: string): Date | null {
  if (!DATE_KEY.test(key)) return null;
  const parsed = newDate(`${key}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== key
    ? null
    : parsed;
}

export function requireDateKey(key: string): Date {
  const date = dateFromKey(key);
  if (!date) {
    throw new DayPlanError("invalid_date", 400, "date must be YYYY-MM-DD");
  }
  return date;
}

export function keyFromDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDaysToKey(key: string, days: number): string {
  const date = requireDateKey(key);
  return keyFromDate(dateFnsAddDays(date, days));
}

/**
 * The calendar day a stored instant belongs to. A value at UTC midnight is a
 * date-only field (due dates are stored that way) and keeps its own date; any
 * other instant is read on the person's wall clock.
 */
export function dateKeyOf(value: Date, timeZone: string): string {
  if (value.toISOString().endsWith("T00:00:00.000Z")) {
    return value.toISOString().slice(0, 10);
  }
  return formatInTimeZone(value, timeZone, "yyyy-MM-dd");
}

/* ---------- settings ---------- */

/**
 * A touch time: HH:MM, no later than 23:30, so the 30-minute touch window never
 * crosses local midnight.
 */
const timeOfDay = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "time must be HH:MM")
  .refine(
    (value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3)) <= 1410,
    "time must be 23:30 or earlier"
  );

/** What a person or an API client may change. Out-of-range values reject. */
export const planSettingsPatchSchema = z
  .object({
    taskLimit: z
      .number()
      .int()
      .min(
        DAY_PLAN_LIMITS.taskMin,
        `taskLimit must be between ${DAY_PLAN_LIMITS.taskMin} and ${DAY_PLAN_LIMITS.taskMax}`
      )
      .max(
        DAY_PLAN_LIMITS.taskMax,
        `taskLimit must be between ${DAY_PLAN_LIMITS.taskMin} and ${DAY_PLAN_LIMITS.taskMax}`
      ),
    focusMinutes: z
      .number()
      .int()
      .min(
        DAY_PLAN_LIMITS.focusMin,
        `focusMinutes must be between ${DAY_PLAN_LIMITS.focusMin} and ${DAY_PLAN_LIMITS.focusMax} (5 hours)`
      )
      .max(
        DAY_PLAN_LIMITS.focusMax,
        `focusMinutes must be between ${DAY_PLAN_LIMITS.focusMin} and ${DAY_PLAN_LIMITS.focusMax} (5 hours)`
      ),
    morningTime: timeOfDay,
    eveningTime: timeOfDay,
    morningOn: z.boolean(),
    eveningOn: z.boolean(),
    /** Take the suggested limit (sets taskLimit to it). */
    acceptSuggestion: z.boolean(),
    /** Leave the limit as it is and stay quiet for 14 days. */
    dismissSuggestion: z.boolean(),
  })
  .partial()
  .strict();

export type PlanSettingsPatch = z.infer<typeof planSettingsPatchSchema>;

export interface EffectiveSettings {
  taskLimit: number;
  mainLimit: number;
  focusMinutes: number;
  morningTime: string;
  eveningTime: string;
  morningOn: boolean;
  eveningOn: boolean;
}

export function mainLimitFor(taskLimit: number): number {
  return Math.min(DAY_PLAN_LIMITS.mainMax, taskLimit);
}

/** The default focus budget: the scheduler's deep-work cap, at most 5 hours. */
export function defaultFocusMinutes(maxDeepWorkPerDay: number | null): number {
  return Math.min(maxDeepWorkPerDay ?? 180, DAY_PLAN_LIMITS.focusMax);
}

/* ---------- titles and estimates ---------- */

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function estimateOf(task: {
  estimatedMinutes?: number | null;
  duration?: number | null;
}): number {
  const minutes = task.estimatedMinutes ?? task.duration;
  return minutes && minutes > 0
    ? minutes
    : DAY_PLAN_LIMITS.defaultEstimateMinutes;
}

/* ---------- ranking and the cut ---------- */

export interface Candidate {
  id: string;
  title: string;
  /** Local date key of the deadline, if any. */
  deadlineKey: string | null;
  isMain: boolean;
  priorityLevel: string | null;
  createdAt: Date;
  minutes: number;
  /**
   * Set for tasks that go first in a fixed order: items the person named in
   * the note, then leftovers they moved to tomorrow. Lower goes first.
   */
  pinned: number | null;
  addedBy: "draft" | "review";
}

const PRIORITY_ORDER: Record<string, number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

/**
 * Pinned first, then deadline (soonest first, none last), main flag, priority,
 * age (oldest first). Stable for equal candidates.
 */
export function rankCandidates(candidates: Candidate[]): Candidate[] {
  return candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort((a, b) => {
      const x = a.candidate;
      const y = b.candidate;
      if (x.pinned !== null || y.pinned !== null) {
        if (x.pinned === null) return 1;
        if (y.pinned === null) return -1;
        if (x.pinned !== y.pinned) return x.pinned - y.pinned;
        return a.index - b.index;
      }
      if (x.deadlineKey !== y.deadlineKey) {
        if (x.deadlineKey === null) return 1;
        if (y.deadlineKey === null) return -1;
        return x.deadlineKey < y.deadlineKey ? -1 : 1;
      }
      if (x.isMain !== y.isMain) return x.isMain ? -1 : 1;
      const priority =
        (PRIORITY_ORDER[x.priorityLevel ?? "MEDIUM"] ?? 2) -
        (PRIORITY_ORDER[y.priorityLevel ?? "MEDIUM"] ?? 2);
      if (priority !== 0) return priority;
      const age = x.createdAt.getTime() - y.createdAt.getTime();
      if (age !== 0) return age;
      return a.index - b.index;
    })
    .map((entry) => entry.candidate);
}

export interface DraftCut {
  chosen: Candidate[];
  mainIds: Set<string>;
  /** Ranked candidates that did not fit the limit or the focus budget. */
  overflow: Candidate[];
  focusMinutes: number;
}

/**
 * Cuts the ranked list at the task limit and the focus budget. It stops at the
 * first task that would take the total past the budget (the first task is
 * always kept, so a plan is never empty because of one long task). The first
 * `mainLimit` chosen tasks are the main ones.
 */
export function cutDraft(
  ranked: Candidate[],
  limits: { taskLimit: number; focusMinutes: number }
): DraftCut {
  const chosen: Candidate[] = [];
  let total = 0;
  let stopped = ranked.length;
  for (let index = 0; index < ranked.length; index += 1) {
    const candidate = ranked[index];
    if (chosen.length >= limits.taskLimit) {
      stopped = index;
      break;
    }
    if (chosen.length > 0 && total + candidate.minutes > limits.focusMinutes) {
      stopped = index;
      break;
    }
    chosen.push(candidate);
    total += candidate.minutes;
  }
  const mainCount = mainLimitFor(limits.taskLimit);
  return {
    chosen,
    mainIds: new Set(chosen.slice(0, mainCount).map((c) => c.id)),
    overflow: ranked.slice(stopped),
    focusMinutes: total,
  };
}

/* ---------- closing a day ---------- */

export const resolutionKinds = ["tomorrow", "someday", "delete"] as const;
export type ResolutionKind = (typeof resolutionKinds)[number];

export const resolutionSchema = z.object({
  taskId: z.string().min(1),
  resolution: z.enum(resolutionKinds),
});

export type Resolution = z.infer<typeof resolutionSchema>;

/**
 * A day closes only when every unfinished planned task has exactly one
 * resolution. Returns what is missing and what names no unfinished task.
 */
export function checkResolutions(
  unfinishedIds: string[],
  resolutions: Resolution[]
): { missing: string[]; unknown: string[]; duplicate: string[] } {
  const unfinished = new Set(unfinishedIds);
  const seen = new Set<string>();
  const duplicate: string[] = [];
  const unknown: string[] = [];
  for (const entry of resolutions) {
    if (!unfinished.has(entry.taskId)) unknown.push(entry.taskId);
    if (seen.has(entry.taskId)) duplicate.push(entry.taskId);
    seen.add(entry.taskId);
  }
  return {
    missing: unfinishedIds.filter((id) => !seen.has(id)),
    unknown,
    duplicate,
  };
}

/* ---------- adaptive limit ---------- */

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function clampLimit(value: number): number {
  return Math.min(
    DAY_PLAN_LIMITS.taskMax,
    Math.max(DAY_PLAN_LIMITS.taskMin, Math.round(value))
  );
}

/**
 * The limit the history points to: the median of finished planned tasks per
 * plan day, clamped to 3..10. Null with fewer than 14 plan days.
 */
export function suggestedLimitFrom(doneCountsPerDay: number[]): number | null {
  if (doneCountsPerDay.length < DAY_PLAN_LIMITS.suggestionMinDays) return null;
  return clampLimit(median(doneCountsPerDay));
}

/* ---------- Someday ---------- */

const DAY_MS = 24 * 60 * 60 * 1000;

export function staleCutoff(now: Date): Date {
  return newDate(now.getTime() - DAY_PLAN_LIMITS.staleDays * DAY_MS);
}

export function cleanupCutoff(now: Date): Date {
  return newDate(now.getTime() - DAY_PLAN_LIMITS.cleanupAfterDays * DAY_MS);
}

export interface TouchSignals {
  lastTouchedAt: Date | null;
  createdAt: Date;
  /** Newest TaskActivity (a person or agent edit) if any. */
  lastActivityAt: Date | null;
}

/**
 * When a person or agent last touched the task. Deliberately ignores
 * `updatedAt`: the scheduler re-placing a task bumps that, and rescheduling is
 * not a touch (D3). A task nobody ever edited is as old as its creation.
 */
export function touchedAtOf(signals: TouchSignals): Date {
  return [signals.lastTouchedAt, signals.lastActivityAt, signals.createdAt]
    .filter((value): value is Date => value != null)
    .reduce((latest, value) => (value > latest ? value : latest));
}

export interface SomedayCandidate extends TouchSignals {
  status: string;
  isArchived: boolean;
  trashedAt: Date | null;
  somedayAt: Date | null;
  isRecurring: boolean;
  recurrenceMasterId: string | null;
  habitId: string | null;
  isSample: boolean;
  dueDate: Date | null;
  deadline: Date | null;
  inOpenPlan: boolean;
}

/**
 * The sweep's rule: an open task nobody touched for 14 days goes to Someday,
 * unless it is protected. Protected: due or deadline from today to 14 days
 * ahead (a past date is not a reason to keep a forgotten task), recurring,
 * a habit, a first-run example, in progress, or in an open day plan.
 * `timeZone` decides what "today" is for the date check.
 */
export function isSomedayCandidate(
  task: SomedayCandidate,
  now: Date,
  timeZone: string
): boolean {
  if (task.status !== "todo") return false;
  if (task.isArchived || task.trashedAt || task.somedayAt) return false;
  if (task.isRecurring || task.recurrenceMasterId || task.habitId) return false;
  if (task.isSample || task.inOpenPlan) return false;
  if (touchedAtOf(task) >= staleCutoff(now)) return false;

  const today = formatInTimeZone(now, timeZone, "yyyy-MM-dd");
  const horizon = keyFromDate(
    dateFnsAddDays(requireDateKey(today), DAY_PLAN_LIMITS.protectedDeadlineDays)
  );
  for (const value of [task.dueDate, task.deadline]) {
    if (!value) continue;
    const key = dateKeyOf(value, timeZone);
    if (key >= today && key <= horizon) return false;
  }
  return true;
}
