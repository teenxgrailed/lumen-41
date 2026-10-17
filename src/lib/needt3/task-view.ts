/**
 * THE TASK VIEW — one setting every task list reads.
 *
 * Home, Tasks, project pages, the Calendar and the phone draw lists of the same
 * tasks. How they are drawn (are completed tasks kept, what a row shows, how
 * a list is ordered and grouped) is one person-level choice, stored in the
 * user settings `prefs.taskView` and read and written through
 * `GET/PATCH /api/user-settings` (docs/connector-api.md).
 *
 * Pure: settings and tasks in, the lists out. `today` is always an argument.
 */
import { hourOf } from "./derive";
import type { V3Priority, V3Task } from "./map";
import { isOverdue } from "./task-day";

/** The key in `prefs`. */
export const TASK_VIEW_PREF = "taskView";

/** What happens to a task once it is ticked. */
export type CompletedMode = "hide" | "today" | "always";
export type TaskSort = "time" | "priority" | "due";
export type TaskGroup = "date" | "project" | "priority";

export interface TaskViewSettings {
  /** hide at once / keep until the end of the day / always keep. */
  completed: CompletedMode;
  /** Row details. */
  subtasks: boolean;
  duration: boolean;
  project: boolean;
  sort: TaskSort;
  group: TaskGroup;
  /** Overdue tasks first, in a list of their own. */
  overdueFirst: boolean;
}

/** What every list did before the setting existed. */
export const DEFAULT_TASK_VIEW: TaskViewSettings = {
  completed: "always",
  subtasks: true,
  duration: true,
  project: true,
  sort: "time",
  group: "date",
  overdueFirst: true,
};

export const COMPLETED_MODES: readonly CompletedMode[] = [
  "hide",
  "today",
  "always",
];
export const TASK_SORTS: readonly TaskSort[] = ["time", "priority", "due"];
export const TASK_GROUPS: readonly TaskGroup[] = [
  "date",
  "project",
  "priority",
];

const pick = <T extends string>(
  v: unknown,
  all: readonly T[],
  fallback: T
): T => (all.includes(v as T) ? (v as T) : fallback);
const flag = (v: unknown, fallback: boolean) =>
  typeof v === "boolean" ? v : fallback;

/** A stored value → settings; anything unknown or malformed falls to its default. */
export function readTaskView(stored: unknown): TaskViewSettings {
  const o =
    stored && typeof stored === "object" && !Array.isArray(stored)
      ? (stored as Record<string, unknown>)
      : {};
  const d = DEFAULT_TASK_VIEW;
  return {
    completed: pick(o.completed, COMPLETED_MODES, d.completed),
    subtasks: flag(o.subtasks, d.subtasks),
    duration: flag(o.duration, d.duration),
    project: flag(o.project, d.project),
    sort: pick(o.sort, TASK_SORTS, d.sort),
    group: pick(o.group, TASK_GROUPS, d.group),
    overdueFirst: flag(o.overdueFirst, d.overdueFirst),
  };
}

/** The setting out of a `prefs` map. */
export const taskViewOf = (prefs: Record<string, unknown> | undefined) =>
  readTaskView(prefs?.[TASK_VIEW_PREF]);

/**
 * Strict check for the API: undefined when `stored` is valid (every key a
 * known option, nothing else), else a message.
 */
export function taskViewError(stored: unknown): string | undefined {
  if (!stored || typeof stored !== "object" || Array.isArray(stored))
    return "taskView must be an object";
  const o = stored as Record<string, unknown>;
  const enums: [keyof TaskViewSettings, readonly string[]][] = [
    ["completed", COMPLETED_MODES],
    ["sort", TASK_SORTS],
    ["group", TASK_GROUPS],
  ];
  for (const [k, all] of enums)
    if (k in o && !all.includes(o[k] as string))
      return `taskView.${k} must be one of ${all.join(", ")}`;
  for (const k of ["subtasks", "duration", "project", "overdueFirst"])
    if (k in o && typeof o[k] !== "boolean")
      return `taskView.${k} must be a boolean`;
  const known = new Set(Object.keys(DEFAULT_TASK_VIEW));
  const extra = Object.keys(o).find((k) => !known.has(k));
  return extra ? `taskView.${extra} is not an option` : undefined;
}

/* ---------- completed tasks ---------- */

type Doneable = Pick<V3Task, "done"> & Partial<Pick<V3Task, "completedAt">>;

/**
 * The day a task was closed. A task closed just now carries no stamp until
 * the server answers; it counts as closed today.
 */
export const doneDay = (t: Pick<V3Task, "completedAt">, today: string) =>
  t.completedAt ? t.completedAt.slice(0, 10) : today;

/** Whether a task is drawn at all: open ones always, closed ones by the mode. */
export function showsTask(
  t: Doneable,
  view: Pick<TaskViewSettings, "completed">,
  today: string
) {
  if (!t.done) return true;
  if (view.completed === "hide") return false;
  if (view.completed === "today") return doneDay(t, today) === today;
  return true;
}

/* ---------- order ---------- */

const RANK: Record<V3Priority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
};

type Orderable = Pick<V3Task, "dueDate" | "scheduledStart"> &
  Partial<Pick<V3Task, "priority">>;

/** The hour a block sits at, unplaced last. */
const hourKey = (t: Orderable) => hourOf(t.scheduledStart) ?? 99;
const dayKey = (t: Orderable) => t.dueDate ?? "9999-12-31";

/**
 * The comparator for a sort. Ties fall through to the next key so a list
 * never reshuffles between renders: time → hour then due day; priority →
 * urgent first, then time; due → due day (no day last), then hour.
 */
export function comparatorFor(sort: TaskSort) {
  return <T extends Orderable>(a: T, b: T): number => {
    if (sort === "priority") {
      const p = RANK[a.priority ?? "medium"] - RANK[b.priority ?? "medium"];
      if (p) return p;
    }
    if (sort === "due") {
      const d = dayKey(a).localeCompare(dayKey(b));
      if (d) return d;
    }
    const h = hourKey(a) - hourKey(b);
    if (h) return h;
    return dayKey(a).localeCompare(dayKey(b));
  };
}

/** A sorted copy. */
export const sortTasks = <T extends Orderable>(
  list: readonly T[],
  sort: TaskSort
) => list.slice().sort(comparatorFor(sort));

/* ---------- groups ---------- */

export interface TaskGroupSection<T = V3Task> {
  key: string;
  title: string;
  tone?: "late";
  tasks: T[];
}

export const PRIORITY_TITLES: Record<V3Priority, string> = {
  urgent: "Urgent",
  high: "High",
  medium: "Medium",
  low: "Low",
  none: "No priority",
};

/**
 * Open tasks regrouped by project (in the order of `projects`, then No
 * project) or by priority, each group sorted. `date` is not handled here: a
 * screen's own day sections are its date grouping. Empty groups are dropped.
 */
export function groupTasks<
  T extends Orderable & Pick<V3Task, "projectId" | "priority">,
>(
  tasks: readonly T[],
  group: Exclude<TaskGroup, "date">,
  sort: TaskSort,
  projects: readonly { id: string; name: string }[]
): TaskGroupSection<T>[] {
  const out: TaskGroupSection<T>[] =
    group === "priority"
      ? (Object.keys(PRIORITY_TITLES) as V3Priority[]).map((p) => ({
          key: `prio-${p}`,
          title: PRIORITY_TITLES[p],
          tasks: tasks.filter((t) => t.priority === p),
        }))
      : [
          ...projects.map((p) => ({
            key: `p-${p.id}`,
            title: p.name,
            tasks: tasks.filter((t) => t.projectId === p.id),
          })),
          {
            key: "none",
            title: "No project",
            tasks: tasks.filter(
              (t) => !t.projectId || !projects.some((p) => p.id === t.projectId)
            ),
          },
        ];
  return out
    .map((s) => ({ ...s, tasks: sortTasks(s.tasks, sort) }))
    .filter((s) => s.tasks.length);
}

/**
 * Pull the overdue tasks out of a set of sections into an Overdue section on
 * top (`first`), or — when the setting is off — leave them where they are.
 * An Overdue section already there is merged, not duplicated.
 */
export function overdueOnTop<T extends Orderable & Pick<V3Task, "done">>(
  sections: readonly TaskGroupSection<T>[],
  first: boolean,
  today: string,
  sort: TaskSort
): TaskGroupSection<T>[] {
  const late = (t: T) =>
    isOverdue(t as unknown as Parameters<typeof isOverdue>[0], today);
  const all = sections.flatMap((s) => s.tasks);
  const hadLate = sections.find((s) => s.key === "overdue");
  if (!first) {
    // no section of its own: its tasks go back among the day's
    if (!hadLate) return sections.slice();
    const rest = sections.filter((s) => s.key !== "overdue");
    const home = rest.find((s) => s.key === "today") ?? rest[0];
    if (!home)
      return [
        { key: "today", title: "Today", tasks: sortTasks(hadLate.tasks, sort) },
      ];
    return rest.map((s) =>
      s === home
        ? { ...s, tasks: sortTasks([...s.tasks, ...hadLate.tasks], sort) }
        : s
    );
  }
  const lateTasks = all.filter(late);
  if (!lateTasks.length) return sections.slice();
  const rest = sections
    .filter((s) => s.key !== "overdue")
    .map((s) => ({ ...s, tasks: s.tasks.filter((t) => !late(t)) }))
    .filter((s) => s.tasks.length);
  return [
    {
      key: "overdue",
      title: "Overdue",
      tone: "late" as const,
      tasks: sortTasks(lateTasks, sort),
    },
    ...rest,
  ];
}
