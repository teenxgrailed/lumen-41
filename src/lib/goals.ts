/**
 * Goals: constants and the public shape, shared by the server (ops, routes,
 * MCP) and the app. Client-safe: no Prisma, no server code.
 *
 * A goal is never a task. The scheduler, Focus, Today, the overdue lists and
 * Plan my day never read goals; only the tasks linked to a goal are planned.
 */

/** The fixed life areas. A goal may also carry a custom label instead. */
export const GOAL_AREAS = [
  "work",
  "money",
  "health",
  "learning",
  "home",
  "relationships",
  "personal",
] as const;
export type GoalPresetArea = (typeof GOAL_AREAS)[number];

export const GOAL_AREA_LABELS: Record<GoalPresetArea, string> = {
  work: "Work",
  money: "Money",
  health: "Health",
  learning: "Learning",
  home: "Home",
  relationships: "Relationships",
  personal: "Personal",
};

/** A preset area's label, or the custom label as the person wrote it. */
export function goalAreaLabel(area: string | null | undefined): string | null {
  if (!area) return null;
  return (GOAL_AREA_LABELS as Record<string, string>)[area] ?? area;
}

export const GOAL_STATUSES = ["active", "achieved", "dropped"] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

export const GOAL_TITLE_MAX = 200;
export const GOAL_AREA_MAX = 40;
export const GOAL_UNIT_MAX = 16;
export const GOAL_NOTE_MAX = 2000;
/** Goals linked to one project, and projects linked to one goal. */
export const GOAL_PROJECTS_MAX = 20;

/**
 * Where a goal's progress comes from, in this order: its linked tasks (set
 * directly, or the tasks of a linked project); else its own manual value;
 * else the average of its subgoals; else nothing yet.
 */
export type GoalProgressSource = "tasks" | "manual" | "subgoals" | "none";

export interface GoalProgress {
  source: GoalProgressSource;
  /** 0..1, or null when nothing measures it yet. */
  ratio: number | null;
  /** Whole percent of `ratio`, or null. */
  percent: number | null;
  /** Linked tasks: closed and total. Zero unless the source is tasks. */
  done: number;
  total: number;
  /** Manual target, as the person set it. */
  current: number | null;
  target: number | null;
  unit: string | null;
}

export interface GoalCheckInSchedule {
  enabled: boolean;
  /** 0 = Sunday … 6 = Saturday, in the person's time zone. */
  weekday: number;
  /** Hour of the day, 0-23, in the person's time zone. */
  hour: number;
  lastAt: string | null;
}

/** A goal as every API (REST, connector ops, MCP) returns it. */
export interface GoalView {
  id: string;
  title: string;
  /** The why. Plain text or the task editor's rich text. */
  description: string | null;
  deadline: string | null;
  area: string | null;
  status: GoalStatus;
  achievedAt: string | null;
  parentId: string | null;
  position: number;
  targetValue: number | null;
  currentValue: number | null;
  unit: string | null;
  manualPercent: number | null;
  checkIn: GoalCheckInSchedule;
  projectIds: string[];
  childIds: string[];
  sourceTaskId: string | null;
  archivedAt: string | null;
  progress: GoalProgress;
  createdAt: string;
  updatedAt: string;
  href: string;
}

export interface GoalCheckInView {
  id: string;
  goalId: string;
  value: number | null;
  percent: number | null;
  note: string | null;
  createdAt: string;
}

/** A task whose title starts with "GOAL:" stands for a goal, not for work. */
export function isGoalTitle(title: string): boolean {
  return /^\s*goal\s*[:\-–—]/i.test(title);
}

/** "GOAL: Save 2 500 CHF" → "Save 2 500 CHF" when a task becomes a goal. */
export function stripGoalPrefix(title: string): string {
  const stripped = title.replace(/^\s*goal\s*[:\-–—]\s*/i, "").trim();
  return stripped || title.trim();
}

/** "2 500 / 2 500 CHF", "40%", "3 of 7 tasks", or null. */
export function goalProgressLabel(progress: GoalProgress): string | null {
  const number = (value: number) =>
    Number.isInteger(value)
      ? value.toLocaleString("en-US").replace(/,/g, " ")
      : value.toFixed(1);
  switch (progress.source) {
    case "tasks":
      return `${progress.done} of ${progress.total} ${progress.total === 1 ? "task" : "tasks"}`;
    case "manual":
      if (progress.target !== null && progress.current !== null) {
        return `${number(progress.current)} / ${number(progress.target)}${progress.unit ? ` ${progress.unit}` : ""}`;
      }
      return progress.percent === null ? null : `${progress.percent}%`;
    case "subgoals":
      return progress.percent === null ? null : `${progress.percent}%`;
    case "none":
      return null;
  }
}
