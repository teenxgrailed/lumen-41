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

  /** The person's labels (`GET /api/tags`). */
  labels: () => [V3, "labels"] as const,
  /** The person's work schedules (`GET /api/work-schedules`), for a task's Hours. */
  workSchedules: () => [V3, "work-schedules"] as const,

  projects: () => [V3, "projects"] as const,
  imports: () => [V3, "imports"] as const,
  /** Whether first-run examples are still on the account (`GET /api/onboarding/sample`). */
  sample: () => [V3, "sample"] as const,
  project: (id: string) => [V3, "project", id] as const,

  events: (range?: DateRange) =>
    range ? ([V3, "events", range] as const) : ([V3, "events"] as const),

  /** Personal time blocks (`GET /api/personal-blocks`). */
  personal: () => [V3, "personal"] as const,

  docs: (sort?: DocsSort) =>
    sort ? ([V3, "docs", sort] as const) : ([V3, "docs"] as const),
  doc: (id: string) => [V3, "doc", id] as const,
  /** Whether the day's note exists (`useDailyNote`). */
  dailyNote: (day: string) => [V3, "daily-note", day] as const,
  /** The day's highlight (`GET /api/highlight?date=`). */
  /** Home stats (`GET /api/stats?range=`). */
  stats: (range: "week" | "month") => [V3, "stats", range] as const,
  /** The day's morning brief (`GET /api/ai/morning-brief?date=`). */
  morningBrief: (day: string) => [V3, "morning-brief", day] as const,
  /** Today's weather for the saved City (`GET /api/weather`). */
  weather: () => [V3, "weather"] as const,
  /** Whether the Sunday review page of this title exists. */
  weeklyReview: (title: string) => [V3, "weekly-review", title] as const,
  highlight: (day: string) => [V3, "highlight", day] as const,
  templates: () => [V3, "templates"] as const,
  shared: () => [V3, "shared"] as const,
  trash: () => [V3, "trash"] as const,
  /** Pages in Trash (`GET /api/pages?trashed=true`); under `trash`, so a trash or restore refreshes it. */
  trashedDocs: () => [V3, "trash", "docs"] as const,
  /** The files attached to one page (`GET /api/pages/:id/assets`). */
  pageAssets: (id: string) => [V3, "doc", id, "assets"] as const,

  habits: () => [V3, "habits"] as const,
  checkins: (range?: DateRange) =>
    range ? ([V3, "checkins", range] as const) : ([V3, "checkins"] as const),
  /** The long read for "Last four months"; under `checkins`, so a tick refreshes it too. */
  checkinHistory: () => [V3, "checkins", "history"] as const,

  mail: (folder?: MailFolder) =>
    folder ? ([V3, "mail", folder] as const) : ([V3, "mail"] as const),
  thread: (id: string) => [V3, "thread", id] as const,

  boards: () => [V3, "boards"] as const,
  board: (id: string) => [V3, "board", id] as const,

  /** The one running Focus session (`GET /api/focus/session`), or none. */
  focusSession: () => [V3, "focus", "session"] as const,
  /** Today's minutes and the streak (`GET /api/focus`). */
  focusStats: () => [V3, "focus", "stats"] as const,

  connections: () => [V3, "connections"] as const,
  settings: () => [V3, "settings"] as const,
  plan: () => [V3, "plan"] as const,
  aiAvailability: () => [V3, "ai-availability"] as const,
  nudges: () => [V3, "nudges"] as const,
  /** The bell's feed; under `nudges` so marking a nudge read refreshes it too. */
  notifications: (group: string) => [V3, "nudges", "feed", group] as const,
  shell: () => [V3, "shell"] as const,
  search: (q: string) => [V3, "search", q] as const,
} as const;

export type QueryKeyOf<K extends keyof typeof qk> = ReturnType<(typeof qk)[K]>;
