# Sol S11 product contracts

These contracts are additive, workspace-scoped and intentionally reuse the
deterministic scheduler. They do not authorize cross-workspace aggregation or
physical deletion.

## Capacity and what-if

- `GET /api/tasks/capacity?days=7` returns aggregate minutes only; calendar
  titles, descriptions, attendees and identifiers are never returned.
- `POST /api/tasks/reschedule-preview` supports `preview`, `apply` and `undo`.
  Tokens are user/workspace-bound, expire after 15 minutes and are rejected
  with `SCHEDULE_PREVIEW_STALE` when tasks, calendar busy time or scheduling
  preferences changed after preview creation.
- Preview results carry deterministic reason codes and short explanations.

## Saved Views

- `/api/saved-views` stores query version `1` with allow-listed filters/sorts.
- Every new view has a workspace scope. Personal views are visible only to the
  creator; workspace views are readable by members and writable by Editors or
  Owners. Archiving is recoverable and no query can name another workspace.
- The Tasks screen saves its list as a `TASKS` / `list` view
  (`src/lib/needt3/saved-task-views.ts` maps it both ways):
  - `filters`: `{ field: "list", operator: "is", value: "inbox" | "today" |
    "upcoming" | "all" }`; `{ field: "projectId", operator: "eq", value: id }`
    or `{ field: "projectId", operator: "is", value: null }` for No project;
    `{ field: "completed", operator: "is", value: "hide" | "today" | "always" }`.
  - `sort`: `{ field: "scheduledStart" | "priority" | "dueDate" }`, led by
    `{ field: "overdue", direction: "desc" }` when overdue tasks come first.
  - `groupBy`: `"date"` (the screen's day sections), `"project"` or `"priority"`.
  - Anything else a client stores is kept as is and read as the default.

## Project health

- `/api/projects/:id/health` exposes current health and immutable history.
- Updates require `expectedVersion`; stale writers receive
  `PROJECT_HEALTH_STALE` instead of overwriting a newer update.

## Habits and focus targets

- Habits are user-owned within one workspace. Weekly materialization is
  idempotent through `(habitId, habitOccurrenceAt)` and creates ordinary
  auto-scheduled Tasks for the existing deterministic scheduler.
- `/api/focus/target` stores a per-user, per-workspace weekly target. Progress
  includes only completed Focus sessions linked to Tasks in that workspace.

## Meeting-note proposals

- `/api/pages/:id/meeting-proposals` accepts only versioned `CREATE_TASK` and
  `RESCHEDULE_WORKSPACE` actions. Creation is inert.
- Approval requires current Page edit access and an unchanged source Page.
  Task creation occurs once; requested scheduling records a standard
  scheduling run for status and failure recovery. Rejection mutates no Task or
  schedule.
