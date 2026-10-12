/**
 * TanStack Query keys for design v3 (docs/port/02-task-plan.md §2.3).
 *
 * Every key starts with "v3", so the new screens never share a cache entry
 * with the old ones (`["tasks"]` in src/hooks/useTaskMutations.ts and
 * friends). A list key is a prefix of its filtered variants, so
 * `invalidateQueries({ queryKey: qk.tasks() })` refreshes every filter.
 */

export interface TaskFilter {
  projectId?: string;
  /** "live" (default) hides Trash; "trash" shows only Trash. */
  scope?: "live" | "trash" | "all";
}

export interface DateRange {
  /** "YYYY-MM-DD", inclusive. */
  from: string;
  /** "YYYY-MM-DD", exclusive. */
  to: string;
}

export type DocsSort = "updated" | "viewed" | "created" | "title";
export type MailFolder = "inbox" | "archive" | "trash" | "all";

const V3 = "v3" as const;

export const qk = {
  all: () => [V3] as const,

  tasks: (filter?: TaskFilter) =>
    filter ? ([V3, "tasks", filter] as const) : ([V3, "tasks"] as const),
  task: (id: string) => [V3, "task", id] as const,

  projects: () => [V3, "projects"] as const,
  imports: () => [V3, "imports"] as const,
  project: (id: string) => [V3, "project", id] as const,

  events: (range?: DateRange) =>
    range ? ([V3, "events", range] as const) : ([V3, "events"] as const),

  docs: (sort?: DocsSort) =>
    sort ? ([V3, "docs", sort] as const) : ([V3, "docs"] as const),
  doc: (id: string) => [V3, "doc", id] as const,
  templates: () => [V3, "templates"] as const,
  shared: () => [V3, "shared"] as const,
  trash: () => [V3, "trash"] as const,

  habits: () => [V3, "habits"] as const,
  checkins: (range?: DateRange) =>
    range ? ([V3, "checkins", range] as const) : ([V3, "checkins"] as const),

  mail: (folder?: MailFolder) =>
    folder ? ([V3, "mail", folder] as const) : ([V3, "mail"] as const),
  thread: (id: string) => [V3, "thread", id] as const,

  boards: () => [V3, "boards"] as const,
  board: (id: string) => [V3, "board", id] as const,

  connections: () => [V3, "connections"] as const,
  settings: () => [V3, "settings"] as const,
  plan: () => [V3, "plan"] as const,
  shell: () => [V3, "shell"] as const,
  search: (q: string) => [V3, "search", q] as const,
} as const;

export type QueryKeyOf<K extends keyof typeof qk> = ReturnType<(typeof qk)[K]>;
