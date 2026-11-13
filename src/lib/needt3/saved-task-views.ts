/**
 * SAVED TASK VIEWS — the Tasks screen's filter state as a `SavedView` row.
 *
 * A saved view is stored through `/api/saved-views` in the versioned,
 * allow-listed query contract (`@/lib/saved-views`, queryVersion 1), so any
 * client of the API can read and write the same views. This file maps the
 * screen's state (which list, which project, how the list is sorted and
 * grouped, what happens to completed tasks) to that contract and back.
 *
 *   list        → filters: { field: "list", operator: "is", value: tab }
 *   project     → filters: { field: "projectId", operator: "eq", value: id }
 *   No project  → filters: { field: "projectId", operator: "is", value: null }
 *   completed   → filters: { field: "completed", operator: "is", value: mode }
 *   sort        → sort: [{ field: "scheduledStart" | "priority" | "dueDate" }]
 *   overdue 1st → sort starts with { field: "overdue", direction: "desc" }
 *   group       → groupBy: "date" | "project" | "priority"
 *
 * Pure: no React, no fetch. Anything unknown in a stored view falls back to
 * the default, so a view written by another client never breaks the screen.
 */
import {
  type CompletedMode,
  DEFAULT_TASK_VIEW,
  type TaskGroup,
  type TaskSort,
  type TaskViewSettings,
} from "./task-view";

/** The Tasks screen tabs (`WorkTab` in components/needt3/work/model). */
export type SavedTaskList = "inbox" | "today" | "upcoming" | "all";
/** The project filter's "No project" value (`NO_PROJECT` in work/model). */
export const SAVED_NO_PROJECT = "__none";

/** What a saved view restores on the Tasks screen. */
export interface TaskViewState {
  tab: SavedTaskList;
  /** A project id, `SAVED_NO_PROJECT`, or null for every project. */
  project: string | null;
  sort: TaskSort;
  group: TaskGroup;
  completed: CompletedMode;
  overdueFirst: boolean;
}

export type SavedViewVisibility = "PERSONAL" | "WORKSPACE";

interface SavedFilter {
  field: string;
  operator: string;
  value: string | string[] | boolean | null;
}
interface SavedSort {
  field: string;
  direction: "asc" | "desc";
}

/** A row of `GET /api/saved-views`, as much as the screen reads of it. */
export interface ApiSavedView {
  id: string;
  name: string;
  userId: string | null;
  visibility: SavedViewVisibility;
  resource: string;
  type: string;
  groupBy: string | null;
  filters: unknown;
  sort: unknown;
  position: number;
  createdAt?: string;
}

/** The query part of a `POST /api/saved-views` body. */
export interface SavedViewQuery {
  resource: "TASKS";
  type: "list";
  queryVersion: 1;
  groupBy: TaskGroup;
  filters: SavedFilter[];
  sort: SavedSort[];
}

const LISTS: readonly SavedTaskList[] = ["inbox", "today", "upcoming", "all"];
const GROUPS: readonly TaskGroup[] = ["date", "project", "priority"];
const COMPLETED: readonly CompletedMode[] = ["hide", "today", "always"];

const SORT_FIELD: Record<TaskSort, string> = {
  time: "scheduledStart",
  priority: "priority",
  due: "dueDate",
};
const SORT_OF: Record<string, TaskSort> = {
  scheduledStart: "time",
  priority: "priority",
  dueDate: "due",
};

const oneOf = <T extends string>(v: unknown, all: readonly T[]): T | null =>
  all.includes(v as T) ? (v as T) : null;

/** The default the Tasks screen opens with. */
export const DEFAULT_TASK_VIEW_STATE: TaskViewState = {
  tab: "today",
  project: null,
  sort: DEFAULT_TASK_VIEW.sort,
  group: DEFAULT_TASK_VIEW.group,
  completed: DEFAULT_TASK_VIEW.completed,
  overdueFirst: DEFAULT_TASK_VIEW.overdueFirst,
};

/** The screen's state → the stored query. */
export function toSavedViewQuery(state: TaskViewState): SavedViewQuery {
  const filters: SavedFilter[] = [
    { field: "list", operator: "is", value: state.tab },
  ];
  if (state.project === SAVED_NO_PROJECT)
    filters.push({ field: "projectId", operator: "is", value: null });
  else if (state.project)
    filters.push({ field: "projectId", operator: "eq", value: state.project });
  filters.push({ field: "completed", operator: "is", value: state.completed });
  const sort: SavedSort[] = [];
  if (state.overdueFirst) sort.push({ field: "overdue", direction: "desc" });
  sort.push({ field: SORT_FIELD[state.sort], direction: "asc" });
  return {
    resource: "TASKS",
    type: "list",
    queryVersion: 1,
    groupBy: state.group,
    filters,
    sort,
  };
}

const asFilters = (v: unknown): SavedFilter[] =>
  Array.isArray(v)
    ? v.filter(
        (f): f is SavedFilter =>
          !!f && typeof f === "object" && typeof f.field === "string"
      )
    : [];
const asSort = (v: unknown): SavedSort[] =>
  Array.isArray(v)
    ? v.filter(
        (s): s is SavedSort =>
          !!s && typeof s === "object" && typeof s.field === "string"
      )
    : [];

/** A stored view → the screen's state; unknown parts take the default. */
export function fromSavedView(
  view: Pick<ApiSavedView, "groupBy" | "filters" | "sort">
): TaskViewState {
  const d = DEFAULT_TASK_VIEW_STATE;
  const filters = asFilters(view.filters);
  const sort = asSort(view.sort);
  const find = (field: string) => filters.find((f) => f.field === field);

  const projectFilter = find("projectId");
  let project: string | null = null;
  if (projectFilter?.operator === "is" && projectFilter.value === null)
    project = SAVED_NO_PROJECT;
  else if (
    projectFilter?.operator === "eq" &&
    typeof projectFilter.value === "string" &&
    projectFilter.value
  )
    project = projectFilter.value;

  const main = sort.find((s) => s.field !== "overdue");
  return {
    tab: oneOf(find("list")?.value, LISTS) ?? d.tab,
    project,
    sort: (main && SORT_OF[main.field]) ?? d.sort,
    group: oneOf(view.groupBy, GROUPS) ?? d.group,
    completed: oneOf(find("completed")?.value, COMPLETED) ?? d.completed,
    overdueFirst: sort.some(
      (s) => s.field === "overdue" && s.direction === "desc"
    ),
  };
}

/** Whether two states draw the same list. */
export function sameTaskViewState(a: TaskViewState, b: TaskViewState) {
  return (
    a.tab === b.tab &&
    a.project === b.project &&
    a.sort === b.sort &&
    a.group === b.group &&
    a.completed === b.completed &&
    a.overdueFirst === b.overdueFirst
  );
}

/** The screen's state out of its parts. */
export function taskViewState(
  tab: SavedTaskList,
  project: string | null,
  view: Pick<TaskViewSettings, "sort" | "group" | "completed" | "overdueFirst">
): TaskViewState {
  return {
    tab,
    project,
    sort: view.sort,
    group: view.group,
    completed: view.completed,
    overdueFirst: view.overdueFirst,
  };
}

/**
 * A view's project may be gone (archived, or another member's in a shared
 * view): then it opens on every project rather than on an empty list.
 */
export function resolveProject(
  project: string | null,
  projectIds: readonly string[]
): string | null {
  if (!project || project === SAVED_NO_PROJECT) return project;
  return projectIds.includes(project) ? project : null;
}

/** The first view that draws exactly the current list, if any. */
export function activeSavedView<V extends ApiSavedView>(
  views: readonly V[],
  current: TaskViewState,
  projectIds: readonly string[]
): V | null {
  return (
    views.find((v) => {
      const s = fromSavedView(v);
      return sameTaskViewState(
        { ...s, project: resolveProject(s.project, projectIds) },
        current
      );
    }) ?? null
  );
}
