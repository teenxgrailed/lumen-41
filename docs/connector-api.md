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

## Imports

Bring projects, tasks and pages in from another tool: Todoist and Notion. The
whole surface is behind the `imports` feature flag: while it is off for you,
`GET` answers `{"enabled": false, "sources": {}, "runs": []}` and every other
route answers `404 IMPORTS_DISABLED`.

```http
GET  /api/connect/imports              # flag state, configured sources, last 5 runs of each
POST /api/connect/imports              # start
GET  /api/connect/imports/:id          # status, progress, warnings
POST /api/connect/imports/:id/cancel   # stop a queued or running run
```

The same routes exist under `/api/imports` for the signed-in session (the
Settings screen uses those).

Start with a Todoist personal API token (Todoist -> Settings ->
Integrations -> Developer) or a Notion internal integration token (the pages
shared with that integration are what gets imported); the run is queued at
once:

```bash
curl -X POST http://localhost:3000/api/connect/imports \
  -H "Authorization: Bearer needt_REPLACE_ME" \
  -H "Content-Type: application/json" \
  -d '{"source": "todoist", "token": "TODOIST_PERSONAL_TOKEN"}'
```

`202 {"run": {...}}`. Without `token` the answer is
`{"authorizeUrl": "https://.../api/imports/<source>/authorize?workspaceId=..."}`:
open it in a browser where you are signed in to Needt to go through the
source's consent screen (Todoist: read-only scope `data:read`; Notion: its own
page picker, where you choose which pages and databases are shared); the run
starts when the source sends you back. That path needs `TODOIST_CLIENT_ID` /
`TODOIST_CLIENT_SECRET` (or `NOTION_CLIENT_ID` / `NOTION_CLIENT_SECRET`) on the
server, else `503 NOT_CONFIGURED`; `GET` says which sources are configured. One
run per source at a time: another start while one is queued or running is
`409 IMPORT_IN_PROGRESS`.

A run:

```json
{
  "run": {
    "id": "run_id",
    "source": "todoist",
    "status": "running",
    "counts": { "total": 240, "done": 120, "skipped": 6, "failed": 0 },
    "warnings": [
      {
        "code": "recurrence_unsupported",
        "message": "\"Renew passport\" repeats \"every 3rd workday of the month\" in Todoist, which Needt could not read; it was imported without repeating.",
        "externalId": "6X7rM8997g3RQmv7"
      }
    ],
    "startedAt": "2026-10-12T10:00:00.000Z",
    "finishedAt": null,
    "createdAt": "2026-10-12T09:59:58.000Z"
  }
}
```

`status` is `queued`, `running`, `done`, `failed` or `cancelled`. A failed
run says why in its last warning (`todoist_unauthorized`,
`todoist_rate_limited`, `todoist_unavailable`, `notion_unauthorized`,
`notion_rate_limited`, `notion_unavailable`, `notion_forbidden`,
`worker_unavailable`, `worker_lost`, `import_failed`). `worker_lost` means the background worker
went away mid-run: a run still queued after 2 hours, or running with no
progress for 30 minutes, is failed by a sweep every 10 minutes. A run of
another user is `404`. The source token is kept encrypted on the run only
while it is queued or running and is erased when it ends; it is never
returned.

Dates: an all-day due (`2026-10-20`) is stored as UTC midnight of that day,
like the other task providers. A due time with an offset is kept as that
instant; one without (a floating time) is read in Todoist's `due.timezone`
when set, else in your time zone from Settings.

What lands where:

| Todoist                                                                                                                                  | Needt                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Project (nested ones flattened, path in the description)                                                                                 | Project                                                                                                             |
| Inbox                                                                                                                                    | Inbox (no project)                                                                                                  |
| Section                                                                                                                                  | Project stage                                                                                                       |
| Task                                                                                                                                     | Task, not auto-scheduled                                                                                            |
| Sub-task, first level                                                                                                                    | Part of its task                                                                                                    |
| Sub-task, deeper                                                                                                                         | Task in the same project, parent named in the description                                                           |
| Label                                                                                                                                    | Tag (by name)                                                                                                       |
| Comment                                                                                                                                  | Appended to the description with its date                                                                           |
| Priority p1 / p2 / p3 / p4                                                                                                               | URGENT / HIGH / MEDIUM / LOW                                                                                        |
| Due date, deadline, duration in minutes                                                                                                  | `dueDate`, `deadline`, `estimatedMinutes`                                                                           |
| Repeat ("every day", "every 2 weeks", "every mon, fri", "every weekday", "every month on the 15th", "every last day", "every year", ...) | `recurrenceRule` (RRULE); a repeat it cannot read is dropped with a warning and its wording kept in the description |

Skipped and counted: completed and deleted tasks, archived projects and
sections, file attachments, reminders, Inbox sections. Running an import
again updates the rows the last one made (title, description, dates,
priority, project, stage; tags are only added) and never duplicates them.
Rows are matched within the workspace the run imports into: importing into
another workspace makes fresh rows there and leaves the first ones as they
were.

### Notion

Notion shows its own page picker during the consent step: you choose the pages
and databases to share, and only those (with everything under them) are
imported. The run reads them through Notion's API (version `2026-03-11`,
paced to 3 requests a second, waiting out `Retry-After` when Notion limits
it). Pages come in as private pages of the importing person, so importing into
a shared workspace shares nothing until you choose to.

| Notion                                                                                                             | Needt                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Page                                                                                                               | Page, under its parent; a page whose parent was not shared becomes a root                                                                                                                                                |
| Icon (emoji), cover                                                                                                | Page icon, cover (files are downloaded; other icons are left out and counted)                                                                                                                                            |
| Paragraphs, headings, lists, to-dos, quotes, code                                                                  | The same blocks; nested lists keep their nesting                                                                                                                                                                         |
| Callout, toggle                                                                                                    | Callout and toggle blocks (a toggle's children follow it as ordinary blocks)                                                                                                                                             |
| Columns, synced blocks                                                                                             | The children in reading order (a synced block no longer syncs; a note says so)                                                                                                                                           |
| Table                                                                                                              | Table (rich text only)                                                                                                                                                                                                   |
| Child page, database reference, page mention                                                                       | A link to the imported page; to one that was not imported, a Notion link and a note                                                                                                                                      |
| Image, file, PDF, audio, video                                                                                     | Image / file block; Notion-hosted files are downloaded the moment they are fetched (they expire after about an hour), up to 10 MB each and 200 MB a run; over that, or failing, the Notion link stays and a note says so |
| Bookmark, embed, link preview                                                                                      | Bookmark / link block with the real address                                                                                                                                                                              |
| Equation                                                                                                           | Code (`latex`), with a note                                                                                                                                                                                              |
| Database                                                                                                           | A page holding a database with a Table view; each row is a page with its values, and its body                                                                                                                            |
| Title, text, number, select, status, multi-select, date, checkbox, URL, email, phone, files, created / edited time | Title, text, number, select, select, multi-select, date, checkbox, URL, email, phone, files, date                                                                                                                        |
| People, relation, rollup, formula, created by, edited by, unique ID                                                | Text: a snapshot of what Notion showed (names, titles of related pages, the computed value); one note per database names the kinds kept as text                                                                          |

Only addresses Needt opens are kept: `http`, `https`, `mailto` and Needt page
paths. A link, bookmark, file, image or cover with any other address
(`javascript:`, `data:` and the like) comes in as plain text and is counted as
`link_unsafe`. Files are downloaded only from Notion's own hosts, a redirect
to any other host stops the download, and a file keeps its type only when it
is a common image, PDF, audio, video, text or CSV type; anything else
(including SVG and HTML) is stored as an opaque download.

Skipped: comments, views, live formulas, buttons, verification, templates,
page permissions, the source of a synced block, and turning databases into
tasks. A second run updates the pages whose last edit in Notion moved and skips
the rest; a page deleted in Notion is left alone in Needt. Notes (`warnings`)
include `truncated` (Notion returned part of a very large page),
`unknown_blocks`, `unsupported_block`, `link_unresolved`, `link_unsafe`,
`equation`,
`synced_block`, `asset_oversize`, `asset_budget`, `asset_failed`,
`properties_flattened`, `database_truncated` and `database_rows_failed`.

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

## Moodboard items

A moodboard's references (the grid the board page and the phone wall draw).
These routes take the signed-in session today, not a connector token, and
answer for the workspace the session is in (`x-workspace-id` to name another
one you belong to).

```http
GET    /api/moodboards/:id/items
POST   /api/moodboards/:id/items
PATCH  /api/moodboards/:id/items/:itemId
DELETE /api/moodboards/:id/items/:itemId
```

Order: `position` ascending, then `createdAt`, then `id`. A new item without a
`position` goes to the end (largest position + 1).

Access: the board's creator, a workspace owner and an editor read and write; a
viewer (by workspace role or by a viewer grant on the board) only reads. A
board that is missing, archived, in another workspace or out of reach answers
`403 {"error":"Moodboard access denied"}`, the same as `/api/moodboards/:id`.
An `itemId` that is not on the board in the URL is `404`.

Create:

```bash
curl -X POST http://localhost:3000/api/moodboards/BOARD_ID/items \
  -H "Content-Type: application/json" \
  -b "next-auth.session-token=..." \
  -d '{
    "kind": "image",
    "url": "https://images.example.com/chair.jpg",
    "title": "Chair",
    "ratio": 1.5,
    "source": { "name": "Example", "domain": "example.com" }
  }'
```

Fields (anything else in the body is a `400`):

| Field          | Type                                   | Notes                                                               |
| -------------- | -------------------------------------- | ------------------------------------------------------------------- |
| `kind`         | `image` \| `link` \| `color` \| `note` | create only; fixed afterwards                                       |
| `url`          | string \| null                         | http(s) URL or a path on this site; required for `image` and `link` |
| `color`        | string \| null                         | hex, `#rgb` to `#rrggbbaa`; required for `color`                    |
| `text`         | string \| null                         | up to 10,000 characters; required for `note`                        |
| `title`        | string \| null                         | up to 240                                                           |
| `ratio`        | number \| null                         | height / width, 0.05 to 20                                          |
| `colorName`    | string \| null                         | up to 120                                                           |
| `source`       | `{ name?, domain? }` \| null           | where the reference came from                                       |
| `thumbnailUrl` | string \| null                         | same rules as `url`                                                 |
| `position`     | number                                 | wall order                                                          |

`data:` and `javascript:` addresses are refused: the item stores an address,
not the file. A path on this site may not contain `\`, must stay on this site
once normalised, and may not point under `/api/`. `PATCH` takes any of the
fields above except `kind`; `null` clears one, except the field the item's kind
requires (`url` on `image`/`link`, `color` on `color`, `text` on `note`), which
is a `400`.

A board holds at most 500 items, the same on every plan. A `POST` to a full
board answers `409 {"error":"Moodboard is full","limit":500}`; the list
returns at most 500. Responses carry `{ "item": {...} }` (list: `{ "items": [...] }`)
with `id`, `moodboardId`, the fields above, `createdAt` and `updatedAt`.
`DELETE` answers `204`.

This API is private and user-scoped. A token can access only its owner's data;
it is not an unauthenticated public integration platform.
