# Connector API

Needt exposes a private per-user API for scripts, bots, n8n, and personal tools.
Each user generates their own token in Settings -> Connectors.

Use:

```http
Authorization: Bearer needt_...
Content-Type: application/json
```

## Create Task

```bash
curl -X POST http://localhost:3000/api/connect/tasks \
  -H "Authorization: Bearer needt_REPLACE_ME" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Process resale photos",
    "description": "Batch edit and upload",
    "estimatedMinutes": 80,
    "deadline": "2026-07-08T17:00:00.000Z",
    "priorityLevel": "HIGH",
    "energyRequired": "MEDIUM",
    "contextTag": "resale-photos"
  }'
```

The task is created as auto-scheduled and Needt immediately runs the deterministic scheduler.
The response includes the task plus `scheduledBlocks` when the task is split into multiple chunks.

## Read Schedule

```bash
curl http://localhost:3000/api/connect/schedule \
  -H "Authorization: Bearer needt_REPLACE_ME"
```

Response:

```json
{
  "generatedAt": "2026-07-07T21:00:00.000Z",
  "tasks": [
    {
      "id": "task_id",
      "title": "Process resale photos",
      "scheduledStart": "2026-07-08T09:00:00.000Z",
      "scheduledEnd": "2026-07-08T09:30:00.000Z",
      "scheduledBlocks": [
        {
          "start": "2026-07-08T09:00:00.000Z",
          "end": "2026-07-08T09:30:00.000Z",
          "chunkIndex": 0,
          "chunkCount": 3,
          "isFrozen": false
        }
      ]
    }
  ]
}
```

`POST /api/connect/schedule` runs the scheduler first, then returns the same schedule shape.

## List Tasks

```bash
curl http://localhost:3000/api/connect/tasks \
  -H "Authorization: Bearer needt_REPLACE_ME"
```

Response:

```json
{
  "generatedAt": "2026-07-08T10:00:00.000Z",
  "tasks": []
}
```

## Reschedule

```bash
curl -X POST http://localhost:3000/api/connect/reschedule \
  -H "Authorization: Bearer needt_REPLACE_ME"
```

## Operations

The same operations Needt's own agent uses are available to external tools.
Each one has a name, a strict JSON input, and a risk level: `read` (never
writes), `reversible` (writes and can be undone), or `irreversible`.

```bash
curl http://localhost:3000/api/connect/ops \
  -H "Authorization: Bearer needt_REPLACE_ME"
```

Returns `{ "ops": [{ "name", "description", "risk", "input" }] }`, where
`input` is a JSON Schema. Unknown fields are rejected.

Run one with its input as the body:

```bash
curl -X POST http://localhost:3000/api/connect/ops/task.create \
  -H "Authorization: Bearer needt_REPLACE_ME" \
  -H "Content-Type: application/json" \
  -d '{ "title": "Send the invoice", "estimateMinutes": 20 }'
```

```json
{
  "op": "task.create",
  "result": { "task": { "id": "...", "title": "Send the invoice" } },
  "actionId": "...",
  "undoable": true,
  "undoableUntil": "2026-10-19T09:00:00.000Z"
}
```

| Operation          | Risk       | Input                                                                                                  | Undo                                 |
| ------------------ | ---------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| `task.list`        | read       | `status` (open, completed, all), `projectId`, `query`, `includeArchived`, `limit`                      | —                                    |
| `task.get`         | read       | `taskId`                                                                                               | —                                    |
| `schedule.get_day` | read       | `date` (YYYY-MM-DD, user's time zone)                                                                  | —                                    |
| `task.create`      | reversible | `title`, `notes`, `dueDate`, `priority`, `projectId`, `tagIds`, `estimateMinutes`, `autoSchedule`      | archives the task                    |
| `task.update`      | reversible | `taskId` plus any of `title`, `notes`, `dueDate`, `priority`, `projectId`, `tagIds`, `estimateMinutes` | writes the previous values back      |
| `task.complete`    | reversible | `taskId` (recurring series are refused for now)                                                        | previous status                      |
| `task.uncomplete`  | reversible | `taskId`, `status` (todo, in_progress)                                                                 | completed with its original time     |
| `task.archive`     | reversible | `taskId`                                                                                               | unarchives with placement and blocks |
| `task.unarchive`   | reversible | `taskId`                                                                                               | archives again                       |
| `task.move_to_day` | reversible | `taskId`, `date` (YYYY-MM-DD)                                                                          | previous dates and blocks            |
| `schedule.auto`    | reversible | `{}`                                                                                                   | every task it moved goes back        |
| `project.create`   | reversible | `name`, `description`, `color`, `icon`                                                                 | archives the project                 |
| `project.archive`  | reversible | `projectId`                                                                                            | previous status                      |
| `mail.to_task`     | reversible | `messageId`, `title`, `estimateMinutes`                                                                | archives the task                    |
| `habit.log`        | reversible | `habitId`, `date` (default today)                                                                      | clears the day                       |
| `habit.unlog`      | reversible | `habitId`, `date` (default today)                                                                      | marks the day again                  |

Errors are JSON `{ "error", "code" }`: `INVALID_INPUT` (400, with
`details`), `FORBIDDEN` (403, a viewer cannot write), `OP_NOT_FOUND` or
`NOT_FOUND` (404), `CONFLICT` or `PROJECT_ARCHIVED` (409; tasks in an
archived project are read-only, as in the app), `UNSUPPORTED` (422).

`APPLIED_NOT_UNDOABLE` (500) means the change **was** made but could not be
recorded in the action log, so it cannot be undone. Do not retry blindly:
`details.result` says what was applied. Only `schedule.auto` can return it,
because the scheduler commits its own work before the log row is written.

Notes on specific operations:

- `task.create` sets the same defaults as the app: default reminders for
  your plan, `MEDIUM` priority, and `autoSchedule: true` (the scheduler may
  place it). It does not schedule; the task is placed by `schedule.auto` or
  the next scheduler run. `notes` are sanitized like the app's editor.
- `schedule.auto` compares the schedule before and after it runs. A change
  made by anything else in that window is treated as part of the run and is
  undone with it.
- `habit.log` and `habit.unlog` reject days that do not exist and days after
  today in your time zone.

Pick the workspace with the `x-workspace-id` header or `?workspaceId=`, as
for the other connector routes.

## Undo

Every write is recorded in the action log with its inverse, computed when it
was applied. Undo works for seven days, with the connector token or a
signed-in session, and only for your own actions (anyone else's is a 404).

```bash
curl -X POST http://localhost:3000/api/agent/actions/ACTION_ID/undo \
  -H "Authorization: Bearer needt_REPLACE_ME"
```

- `200 { "status": "undone" }` (or `already_undone`).
- `409 { "status": "undo_conflict", "conflicts": [...] }` when a row the
  action touched was changed afterwards by someone or something else. Nothing
  is overwritten; each conflict names the row and both versions.
- `422 { "status": "not_undoable", "reason" }` for `no_inverse`, `expired`,
  or `failed`.

`POST /api/agent/runs/RUN_ID/undo` undoes every action of an agent run,
newest first. It stops at the first conflict and returns `409` with
`results` (what was undone and the conflict) and `remaining` (the older
actions left applied). `GET /api/agent/actions?runId=&limit=` lists your
action log. Two undo calls for the same action never both apply: the second
gets `already_undone`. Log entries are deleted 30 days after their undo
window ends.

## Webhooks

Settings -> Connectors can send best-effort POSTs for:

- `schedule.changed`
- `task.completed`

Payload:

```json
{
  "event": "schedule.changed",
  "createdAt": "2026-07-07T21:00:00.000Z",
  "payload": {
    "taskCount": 4
  }
}
```

This API is private and user-scoped. A token can access only its owner's data;
it is not an unauthenticated public integration platform.
