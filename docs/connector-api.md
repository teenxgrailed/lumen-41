# Connector API

Needt exposes a private per-user API for scripts, bots, n8n, and personal tools.
Each user generates their own token in Settings -> Connectors.

Use:

```http
Authorization: Bearer needt_...
Content-Type: application/json
```

## MCP (Claude Code, Claude Desktop, claude.ai, ChatGPT)

Needt runs a remote MCP server (Streamable HTTP, stateless, JSON responses,
POST only, protocol versions `2025-11-25`, `2025-06-18`, `2025-03-26`,
`2024-11-05`). JSON-RPC batches are refused (`-32600`).

| URL                             | Who uses it                                              |
| ------------------------------- | -------------------------------------------------------- |
| `https://mcp.needt.app/mcp`     | Canonical resource; OAuth clients (claude.ai, ChatGPT)   |
| `https://use.needt.app/api/mcp` | Clients that send a personal `needt_…` token in a header |

With a personal token:

1. Settings -> Personal API -> Generate token (shown once; rotating it
   disconnects every agent).
2. Connect:

```bash
claude mcp add --transport http needt https://use.needt.app/api/mcp \
  --header "Authorization: Bearer needt_REPLACE_ME"
```

Clients that only launch local processes can use the stdio bridge in `mcp/`.

### Authorization

A request without a usable token gets `401` with

```http
WWW-Authenticate: Bearer resource_metadata="https://mcp.needt.app/.well-known/oauth-protected-resource/mcp", scope="needt.read needt.write mail.read"
```

The metadata (RFC 9728) is served at
`/.well-known/oauth-protected-resource` and
`/.well-known/oauth-protected-resource/mcp` on both hosts. It names the
resource `https://mcp.needt.app/mcp` and the authorization server
`https://use.needt.app`.

| Scope         | Allows                                                                                                                 |
| ------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `needt.read`  | Search, list and read tasks, projects, events, pages, habits                                                           |
| `needt.write` | Create and change them, run the scheduler                                                                              |
| `mail.read`   | Mail metadata (sender, subject, snippet, labels; never the body) in search, `needt_list`/`needt_get` with `type: mail` |

A personal token carries all three and is not tied to a workspace. A call
that needs a scope the token lacks gets `403` with
`WWW-Authenticate: Bearer error="insufficient_scope", scope="…"` naming every
scope; search without `mail.read` simply leaves mail out.

The same token rules apply to the `/api/connect/*` routes below: reads need
`needt.read`, writes `needt.write`.

### OAuth (claude.ai, ChatGPT, Claude Code)

Add `https://mcp.needt.app/mcp` as a custom connector; the client finds
everything else itself. The authorization server is the app,
`https://use.needt.app` (RFC 8414 metadata at
`/.well-known/oauth-authorization-server`):

| Endpoint               | Notes                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `GET /oauth/authorize` | Signs the person in if needed, then asks: client name, where it returns, scopes (mail is its own tick box), one workspace       |
| `POST /oauth/token`    | `authorization_code` (PKCE S256 only) and `refresh_token`; form-encoded; `resource` must be `https://mcp.needt.app/mcp` exactly |
| `POST /oauth/register` | RFC 7591 dynamic registration, public clients (`token_endpoint_auth_method: none`)                                              |
| `POST /oauth/revoke`   | RFC 7009; revoking either token ends the whole grant                                                                            |

- Clients are public (no secret). A client may also be identified by the
  https URL of its client metadata document (CIMD): Needt fetches it over
  https only, refusing private and loopback addresses (also after
  redirects), with a timeout and a 64 KB cap, caches it for a day, and
  checks `redirect_uri` against it.
- Redirect URIs are https, or http on a loopback address; a loopback
  redirect matches any port (native clients such as Claude Code).
- Every authorization response carries `iss` (RFC 9207).
- Codes live 60 seconds and work once; a replayed code revokes what it
  produced. Access tokens live 1 hour, refresh tokens 30 days. Refresh
  tokens rotate; presenting a rotated one revokes the whole grant.
- Tokens are opaque and stored only as hashes. The person sees and
  disconnects apps in Settings › Connected apps (`GET /api/oauth/connected-apps`,
  `DELETE /api/oauth/connected-apps/:id`).

### Workspaces

Every tool takes an optional `workspaceId` argument (OAuth clients cannot
send headers). Header clients can also send `x-workspace-id: <id>`.
`needt_whoami` lists the person's workspaces. Without either, calls act in
the personal workspace — or, for an OAuth grant, in the workspace chosen at
consent; an OAuth grant cannot act in any other.

### Tools

Every tool carries `readOnlyHint` and `destructiveHint` annotations.

| Tool                     | Scope                                          | What it does                                                                                                                                   |
| ------------------------ | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `needt_whoami`           | —                                              | The person, token kind, scopes, current workspace and all workspaces                                                                           |
| `needt_search`           | `needt.read` (+`mail.read` for mail)           | Text search across tasks, projects, events, pages, habits, mail                                                                                |
| `needt_list`             | `needt.read` (+`mail.read` for mail)           | Paginated list by `type` (task, project, event, calendar, page, habit, mail, moodboard); `limit` ≤ 50, `cursor`                                |
| `needt_get`              | `needt.read` (+`mail.read` for mail)           | One object in full by `type` and `id`; mail is metadata only, never the body                                                                   |
| `needt_create_task`      | `needt.write`                                  | `POST /api/connect/tasks`; also takes `projectId`, `entry`, `subtasks` (ordered) and `dependsOnId`, so a task and its steps arrive in one call |
| `needt_schedule`         | `needt.write` (`needt.read` with `run: false`) | `POST` (or `GET` with `run: false`) `/api/connect/schedule`                                                                                    |
| `needt_reschedule`       | `needt.write`                                  | `POST /api/connect/reschedule`                                                                                                                 |
| `needt_control`          | `needt.write` (`needt.read` for `overview`)    | `POST /api/connect/control`; every action the route accepts, deletes need `confirm: true`                                                      |
| `needt_update_task`      | `needt.write`                                  | Change title, description, dueDate, estimatedMinutes, priority, energy, status, projectId, entry, dependsOnId; other fields are refused        |
| `needt_add_subtasks`     | `needt.write`                                  | Append ordered subtasks (up to 30 per task) to an existing task                                                                                |
| `needt_complete_subtask` | `needt.write`                                  | Tick a subtask, or untick with `done: false`; the answer says `allDone` when the task itself is the only step left                             |
| `needt_complete_task`    | `needt.write`                                  | Mark a task done, or not done with `done: false`; repeating is a no-op                                                                         |
| `needt_create_event`     | `needt.write`                                  | Event in a Needt calendar (personal workspace only; provider calendars refused)                                                                |
| `needt_create_page`      | `needt.write`                                  | Page with a Markdown or plain-text body, optionally under `parentId`                                                                           |
| `needt_append_page`      | `needt.write`                                  | Append Markdown or plain text to a page you can edit                                                                                           |
| `needt_log_habit`        | `needt.write`                                  | Mark a habit kept for a day (default today), or not with `kept: false`; future days refused                                                    |

`needt_create_task`, `needt_schedule`, `needt_reschedule` and `needt_control`
run the connector routes in-process with the caller's own token, so auth,
workspace scoping and confirmation rules are the routes' own. The other write
tools call the services the app's own routes use (task update, page write
path, habit completion, local events) after resolving the workspace with an
editor role, so validation, plan limits and side effects match the app. Pages
and blocks written through MCP are marked as AI-authored. MCP calls are not
metered as AI actions.

### Limits

| Limit                   | Per minute |
| ----------------------- | ---------- |
| Every call, per person  | 120        |
| Write tools, per person | 30         |
| Every call, per IP      | 600        |

The per-IP limit is generous because hosted clients share a few egress
addresses. Over a limit the answer is `429` with `Retry-After`.

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
    "contextTag": "resale-photos",
    "projectId": "project_id",
    "entry": "Open the first folder",
    "subtasks": ["Cull the blurry shots", { "title": "Edit the keepers" }, "Upload"]
  }'
```

The task is created as auto-scheduled and Needt immediately runs the deterministic scheduler.
The response includes the task plus `scheduledBlocks` when the task is split into multiple chunks, and its `parts` (the subtasks) in order.

### Subtasks

A task is the **closing step** of its own small chain: `entry` is the very first
small step (about two minutes), `subtasks` are the steps in the order they are
done (one level, up to 30, each up to 160 characters), and the task itself is
finished last, once every subtask is done. In the app a project page draws them
in that order with the task last. `dependsOnId` names the one existing open task
this one cannot start before (it is refused when it would make a loop). There is
no `parentId`: a subtask is a part of its task, not a task of its own.

Agents (MCP tools, Ask Needt) are told to break any non-trivial work this way;
`needt_get` with `type: task` returns the subtasks with their ids, and
`needt_complete_subtask` ticks them. Needt does not close the task for the agent:
when `allDone` is `true` the agent closes the task with `needt_complete_task`.

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

## Notifications

The feed behind the bell in the app, read-only, for your own tools. It is
assembled from data Needt already keeps, so nothing needs to be turned on.

```bash
curl "http://localhost:3000/api/connect/notifications?group=activity&limit=20" \
  -H "Authorization: Bearer needt_REPLACE_ME"
```

```json
{
  "items": [
    {
      "key": "comment:cm1",
      "group": "activity",
      "kind": "comment",
      "actor": "Lena Fischer",
      "title": "Lena Fischer commented on Design rules",
      "body": "13/12 everywhere in chrome, agreed.",
      "at": "2026-10-16T09:48:00.000Z",
      "link": "/pages/PAGE_ID",
      "unread": true
    }
  ],
  "nextBefore": "2026-10-16T09:48:00.000Z",
  "unreadCount": 3
}
```

Query: `group` (`activity`, the default, or `reminders`), `limit` (1 to 100,
default 30), `before` (an ISO time; pass the previous `nextBefore` for the
next page). Activity is newest first and covers the last 30 days. Reminders
is soonest first, in one page, and has no `nextBefore`.

| `kind`         | Group     | Where it comes from                                           |
| -------------- | --------- | ------------------------------------------------------------- |
| `nudge`        | activity  | Needt's proactive nudges (overdue, overbooked day, free time) |
| `notification` | activity  | Cards other parts of Needt write to the `Notification` table  |
| `agent`        | activity  | Actions an agent or MCP client applied (the action log)       |
| `comment`      | activity  | Others' comments on pages you own or were given access to     |
| `share`        | activity  | Someone gave you access to a page                             |
| `sync`         | activity  | A calendar that failed to sync and needs reconnecting         |
| `import`       | activity  | A Todoist or Notion import that finished or failed            |
| `reminder`     | reminders | A pending task reminder, with the time it fires in `at`       |
| `due`          | reminders | A task due within two days or overdue (up to 14 days back)    |

`key` is stable and is what the read call takes. `link` is a path in the
app. `unreadCount` is the number of unread activity items in the window and
is returned for both groups. Reminders are never unread. Agent actions,
imports, reminders and due tasks are limited to the workspace you pick with
`x-workspace-id` or `?workspaceId=`; nudges, comments, shares and calendar
problems follow you across workspaces.

Mark items read. Read state is yours alone and any role may set it:

```bash
curl -X POST http://localhost:3000/api/connect/notifications/read \
  -H "Authorization: Bearer needt_REPLACE_ME" \
  -H "Content-Type: application/json" \
  -d '{ "keys": ["comment:cm1"] }'
# or everything up to now: -d '{ "all": true }'
```

Returns `204`. `keys` takes 1 to 200 item keys; anything else is a `400`
with `{ "error" }`. Marking all covers items that exist now; later ones are
unread again.

The app itself reads the same feed from `GET /api/notifications?feed=1` (same
query) and marks with `POST /api/notifications/read`, using the signed-in
session instead of a token. `GET /api/notifications` without `feed=1` is the
older nudge delivery the corner tip uses; it marks what it returns as
delivered, so do not poll it from a script.

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
once normalised, and may not point under `/api/`, except an `image`'s own
uploaded picture (`/api/moodboards/:id/assets/:assetId`, of this board). `PATCH` takes any of the
fields above except `kind`; `null` clears one, except the field the item's kind
requires (`url` on `image`/`link`, `color` on `color`, `text` on `note`), which
is a `400`.

A board holds at most 500 items, the same on every plan. A `POST` to a full
board answers `409 {"error":"Moodboard is full","limit":500}`; the list
returns at most 500. Responses carry `{ "item": {...} }` (list: `{ "items": [...] }`)
with `id`, `moodboardId`, the fields above, `createdAt` and `updatedAt`.
`DELETE` answers `204`.

### Reorder, pictures, sorting, sharing

```http
PATCH  /api/moodboards/:id/items          { "order": ["itemId", ...] }
POST   /api/moodboards/:id/items/upload   multipart: file, title?, ratio?, position?
GET    /api/moodboards/:id/assets/:assetId
GET    /api/moodboards?sort=updated|created|name&dir=asc|desc
DELETE /api/moodboards/:id?permanent=true
PUT    /api/moodboards/:id/permissions    { "email": "...", "role": "VIEWER|EDITOR" }
DELETE /api/moodboards/:id/permissions    { "userId": "<your own id>" }
```

- **Reorder** needs an editor. The listed references take, in that order, the
  places the listed ones held (the rest stay put) and the wall is renumbered
  1..n; the answer is the wall in its new order. An id that is not on the board
  is `404` and nothing moves; a repeated id, an empty list or more than 500 ids
  is `400`.
- **Upload** takes a JPEG, PNG, WebP or GIF up to 1.5 MB (the type is read from
  the bytes: `415` otherwise, `413` over the size). The picture and its `image`
  item are written together (`201 { "item" }`). The item counts toward the
  500; the board page shrinks pictures to a JPEG of at most 900 px first.
  A workspace also holds at most 200 MB of pictures in all its boards, the same
  on every plan: past that an upload is `413` with "Your workspace's moodboard
  pictures are full (200 MB). Remove some pictures to add more." Pictures
  nothing refers to any more are freed an hour after they were added (when a
  tile is removed, the picture of that tile stays for that hour so Undo works).
  A picture is served with `Cache-Control: private, max-age=300`, only while a
  tile on its board refers to it.
- **Links** are read server-side when created without `thumbnailUrl`: the
  page's title, site name and picture address replace what was sent. Only
  `https` pages on the default port, never a private, loopback or link-local
  address (also after redirects), at most 1 MB and 4 seconds. Anything that
  fails leaves the link as sent. Each person is read at most 30 times in 10
  minutes; over that, the link is saved as sent, without an error.
- **List** order is the server's; `name` ignores case. Any change to a board's
  references, people or title moves its `updatedAt` ("Date updated").
- **Delete forever** only works for a board already in Trash (`409` otherwise)
  and only for the board's creator or a workspace owner; someone who was only
  given full access on the board is refused (`403`).
- **Permissions**: reading who is on a board is open to anyone who can see it;
  giving, changing or removing a role needs full access, and an invite reaches
  people already in the workspace (`403 WORKSPACE_MEMBER_REQUIRED` otherwise;
  nobody is emailed). Anyone may remove their own access (Leave board).
- **Old canvas**: `GET …/items` also returns, after the board's own items,
  what the old canvas stored as read-only items (`fromCanvas: true`, ids that
  start with `canvas:`) and `canvasSkipped`, the canvas elements with no grid
  form.
- **Anyone with the link**: `PATCH /api/moodboards/:id { "linkShare": true }`
  (full access) opens a read-only page at `/b/:id/:token` (the token is
  `shareToken` on `GET /api/moodboards/:id`, for full access) and
  `GET /api/public/moodboards/:id/:token`. Turning it off, Trash or a wrong
  token answer `404`.

## Public endpoints

### `GET /api/lifetime-seats`

No token. Returns `{ "sold": number, "total": 300 }`. `sold` is the same count
the Lifetime cap uses (buyers plus open checkout holds), so the landing counter
and the checkout never disagree; `total` is the cap constant. Cached in memory
for 5 minutes and sent with `Cache-Control: public, max-age=300`. CORS:
`https://needt.app` (plus `http://localhost:*` outside production), `GET` and
`OPTIONS`, no credentials; a browser on another origin gets `403`.

This API is private and user-scoped. A token can access only its owner's data;
it is not an unauthenticated public integration platform.
