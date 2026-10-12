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

Skipped: comments, views, live formulas, buttons, verification, templates,
page permissions, the source of a synced block, and turning databases into
tasks. A second run updates the pages whose last edit in Notion moved and skips
the rest; a page deleted in Notion is left alone in Needt. Notes (`warnings`)
include `truncated` (Notion returned part of a very large page),
`unknown_blocks`, `unsupported_block`, `link_unresolved`, `equation`,
`synced_block`, `asset_oversize`, `asset_budget`, `asset_failed`,
`properties_flattened`, `database_truncated` and `database_rows_failed`.

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
