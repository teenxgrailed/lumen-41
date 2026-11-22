import {
  SUBTASK_TITLE_MAX,
  entrySchema,
  subtaskListSchema,
} from "@/services/tasks/subtasks";

import { addCalendarDays, differenceInMinutes } from "@/lib/date-utils";

/**
 * Pure rules of Always easy start (openspec always-easy-start). No database,
 * no clock, no AI: everything takes its inputs, so each rule is tested alone.
 */

/** The entry step is something a person can do in this long. */
export const ENTRY_MAX_MINUTES = 15;
/** Subtasks added on a create or a re-split. */
export const MAX_NEW_SUBTASKS = 3;
/** More open tasks than this on one day and the overflow moves on. */
export const DAY_TASK_LIMIT = 6;
/** A task given another day this many times is stuck. */
export const STUCK_RESCHEDULES = 1;
/** A task not started this many days after it was due to start is stuck. */
export const STUCK_START_DAYS = 2;
/** A rewritten task (or one whose rewrite was undone) is left alone this long. */
export const COOLDOWN_DAYS = 7;
/** After an undone automatic spread, nothing is spread again for this long. */
export const SPREAD_PAUSE_HOURS = 24;
/** Days ahead (today included) whose load is looked at. */
export const BALANCE_DAYS = 4;

/** What a task gets when no AI answers: no subtasks, no title change. */
export const FALLBACK_ENTRY = "Open it and do the first 10 minutes.";

export interface EntryPlan {
  entry: string;
  /** A simpler title; only a re-split proposes one. */
  title?: string;
  subtasks: string[];
  source: "ai" | "fallback";
}

export function fallbackPlan(): EntryPlan {
  return { entry: FALLBACK_ENTRY, subtasks: [], source: "fallback" };
}

/* ---------- eligibility ---------- */

export interface EasyTaskFacts {
  status: string;
  isArchived: boolean;
  trashedAt: Date | null;
  somedayAt: Date | null;
  isSample: boolean;
  isRecurring: boolean;
  recurrenceMasterId: string | null;
  habitId: string | null;
  externalTaskId: string | null;
}

/** Work the person owns and is still to do; never a habit, a series or a synced row. */
export function isPersonalOpenTask(task: EasyTaskFacts): boolean {
  return (
    task.status === "todo" &&
    !task.isArchived &&
    !task.trashedAt &&
    !task.somedayAt &&
    !task.isSample &&
    !task.isRecurring &&
    !task.recurrenceMasterId &&
    !task.habitId &&
    !task.externalTaskId
  );
}

/** A freshly created task gets an entry only when it has none. */
export function needsEntryOnCreate(
  task: EasyTaskFacts & { entry: string | null }
): boolean {
  return isPersonalOpenTask(task) && !(task.entry ?? "").trim();
}

export interface StuckFacts extends EasyTaskFacts {
  rescheduleCount: number;
  startDate: Date | null;
  scheduledStart: Date | null;
  lastTouchedAt: Date | null;
  simplifiedAt: Date | null;
  /** Subtasks already ticked: the person has started. */
  doneParts: number;
}

export type StuckReason = "rescheduled" | "not_started";

/** Why a task is stuck, or null. A cooling-down task is never stuck. */
export function stuckReason(task: StuckFacts, now: Date): StuckReason | null {
  if (!isPersonalOpenTask(task)) return null;
  if (task.doneParts > 0) return null;
  if (
    task.simplifiedAt &&
    task.simplifiedAt > addCalendarDays(now, -COOLDOWN_DAYS)
  ) {
    return null;
  }
  if (task.rescheduleCount >= STUCK_RESCHEDULES) return "rescheduled";
  // "Due to start": its start day, else the time it is placed at.
  const start = task.startDate ?? task.scheduledStart;
  if (!start) return null;
  if (task.lastTouchedAt && task.lastTouchedAt > start) return null;
  const overdueMinutes = differenceInMinutes(now, start);
  return overdueMinutes >= STUCK_START_DAYS * 24 * 60 ? "not_started" : null;
}

/* ---------- overloaded day ---------- */

export interface DayTask {
  id: string;
  priorityLevel?: string | null;
  dueDate?: Date | null;
  /** Pinned, locked, frozen, hard-deadline, habit or series: stays where it is. */
  fixed: boolean;
}

/**
 * Of the tasks on one day (already in the order the spread uses: priority
 * first), the ids that go to later days. The day keeps `limit`; only a task
 * that is not fixed can leave, the lowest priority first. A day that cannot
 * shed enough because of fixed tasks sheds what it can.
 */
export function overflowIds(
  ordered: readonly DayTask[],
  limit: number = DAY_TASK_LIMIT
): string[] {
  const excess = ordered.length - limit;
  if (excess <= 0) return [];
  const out: string[] = [];
  for (let i = ordered.length - 1; i >= 0 && out.length < excess; i -= 1) {
    if (!ordered[i].fixed) out.push(ordered[i].id);
  }
  return out;
}

/* ---------- the model's answer ---------- */

const clip = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
};

/**
 * The model's answer as a plan, or null when nothing usable is in it. One JSON
 * object: `entry` (required), `subtasks` (at most 3, each a short string) and,
 * for a re-split, `title`. A title equal to the old one is dropped.
 */
export function parseEntryPlan(
  raw: string,
  options: { previousTitle?: string; wantTitle?: boolean } = {}
): EntryPlan | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const { entry, subtasks, title } = data as {
    entry?: unknown;
    subtasks?: unknown;
    title?: unknown;
  };
  if (typeof entry !== "string") return null;
  const entryText = clip(entry, SUBTASK_TITLE_MAX);
  if (!entrySchema.safeParse(entryText).success) return null;

  const items = Array.isArray(subtasks)
    ? subtasks
        .filter((item): item is string => typeof item === "string")
        .map((item) => clip(item, SUBTASK_TITLE_MAX))
        .filter(Boolean)
        .slice(0, MAX_NEW_SUBTASKS)
    : [];
  const parts = subtaskListSchema.safeParse(items);
  const subtaskTitles = parts.success ? items : [];

  let newTitle: string | undefined;
  if (options.wantTitle && typeof title === "string") {
    const clean = clip(title, SUBTASK_TITLE_MAX);
    if (clean && clean !== (options.previousTitle ?? "").trim()) {
      newTitle = clean;
    }
  }
  return {
    entry: entryText,
    ...(newTitle ? { title: newTitle } : {}),
    subtasks: subtaskTitles,
    source: "ai",
  };
}

/* ---------- the one line ---------- */

const LINE_MAX = 110;

/** "Simplified: ..." as the person reads it, one line. */
export function simplifiedLine(
  input:
    | { kind: "entry" | "resplit"; title: string; entry: string }
    | { kind: "spread"; moved: number }
): string {
  if (input.kind === "spread") {
    const n = input.moved;
    return `Simplified: moved ${n} ${n === 1 ? "task" : "tasks"} to later days`;
  }
  const line = `Simplified: ${clip(input.title, 40)}, first step "${clip(input.entry, 50)}"`;
  return clip(line, LINE_MAX);
}
