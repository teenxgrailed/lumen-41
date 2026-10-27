# Connector API

Needt exposes a private per-user API for scripts, bots, n8n, and personal tools.
Each user generates their own token in Settings -> Connectors.

Use:

```http
Authorization: Bearer needt_...
Content-Type: application/json
```

Some routes below are what the app's own screens call and are marked
**Session only**: they answer the signed-in browser session (the NextAuth
cookie) and refuse a `needt_...` token with `401`. Use the `/api/connect/*`
routes or MCP from scripts and agents.

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
   disconnects every agent). A token works for one year and is then refused
   with `401` like an unknown one; the settings screen and
   `GET /api/connector-settings` (`tokenExpiresAt`, `tokenExpired`) show the
   date. Tokens made before 2026-10-23 have `tokenExpiresAt: null` and do not
   expire until they are rotated.
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

| Scope              | Allows                                                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `needt.read`       | Search, list and read tasks, projects, events, pages, habits                                                           |
| `needt.write`      | Create and change them, run the scheduler                                                                              |
| `mail.read`        | Mail metadata (sender, subject, snippet, labels; never the body) in search, `needt_list`/`needt_get` with `type: mail` |
| `needt.admin.read` | Read-only view of the Admin area through the `needt_admin_*` tools. Admins only; see Admin read below                  |

A personal token carries `needt.read`, `needt.write` and `mail.read` (never
`needt.admin.read`) and is not tied to a workspace. A call
that needs a scope the token lacks gets `403` with
`WWW-Authenticate: Bearer error="insufficient_scope", scope="…"` naming every
scope; search without `mail.read` simply leaves mail out.

MCP never reaches a Private page, or any page filed under one, whoever owns it:
`needt_search`, `needt_list` and `needt_get` leave it out, and
`needt_create_page` and `needt_append_page` refuse it (the answer is the same
as for a page that does not exist). The assistant inside Needt keeps the same
line. Calendars, personal time and mail belong to the person, not to a
workspace, so over MCP they answer only from the personal workspace, never from
a Team workspace.

The same token rules apply to the `/api/connect/*` routes below: reads need
`needt.read`, writes `needt.write`. Writes there share the limit of 30 a
minute per person that `/api/mcp` has.

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

| Tool                         | Scope                                          | What it does                                                                                                                                                                                                                                                                                                  |
| ---------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `needt_whoami`               | —                                              | The person, token kind, scopes, current workspace and all workspaces                                                                                                                                                                                                                                          |
| `needt_search`               | `needt.read` (+`mail.read` for mail)           | Text search across tasks, projects, events, pages, habits, mail                                                                                                                                                                                                                                               |
| `needt_list`                 | `needt.read` (+`mail.read` for mail)           | Paginated list by `type` (task, project, event, calendar, page, habit, mail, moodboard, personal_time, goal); `limit` ≤ 50, `cursor`; `originPageId` lists the tasks that came from one page                                                                                                                  |
| `needt_get`                  | `needt.read` (+`mail.read` for mail)           | One object in full by `type` and `id`; mail is metadata only, never the body                                                                                                                                                                                                                                  |
| `needt_create_task`          | `needt.write`                                  | `POST /api/connect/tasks`; also takes `projectId`, `entry`, `fullTime`, `subtasks` (ordered), `dependsOnId`, `originPageId` (the page it came from) and `goalId`, so a task and its steps arrive in one call; `start` places and pins it, `autoSchedule: false` keeps the scheduler off it. See Place and pin |
| `needt_schedule`             | `needt.write` (`needt.read` with `run: false`) | `POST` (or `GET` with `run: false`) `/api/connect/schedule`                                                                                                                                                                                                                                                   |
| `needt_reschedule`           | `needt.write`                                  | `POST /api/connect/reschedule`; with `taskIds` or `scope` (today, overdue) and optional `days` it runs `task.spread` instead                                                                                                                                                                                  |
| `needt_control`              | `needt.write` (`needt.read` for `overview`)    | `POST /api/connect/control`; every action the route accepts, deletes need `confirm: true`                                                                                                                                                                                                                     |
| `needt_update_task`          | `needt.write`                                  | Change title, description, dueDate, estimatedMinutes, priority, energy, status, projectId, goalId, entry, fullTime, dependsOnId, originPageId, and placement (`start`, `pinned`, `autoSchedule`); other fields are refused. Same body as `PATCH /api/connect/tasks/:id`                                       |
| `needt_add_subtasks`         | `needt.write`                                  | Append ordered subtasks (up to 30 per task) to an existing task                                                                                                                                                                                                                                               |
| `needt_complete_subtask`     | `needt.write`                                  | Tick a subtask, or untick with `done: false`; the answer says `allDone` when the task itself is the only step left                                                                                                                                                                                            |
| `needt_complete_task`        | `needt.write`                                  | Mark a task done, or not done with `done: false`; repeating is a no-op                                                                                                                                                                                                                                        |
| `needt_attach_file`          | `needt.write`                                  | Attach an image (JPEG, PNG, WebP, GIF) or a PDF to a task from `contentBase64`, up to 4 MB and ten per task; the type is read from the bytes. `POST /api/connect/ops/task.attach`; the answer carries the undo id                                                                                             |
| `needt_remove_attachment`    | `needt.write`                                  | Remove a file from a task by `attachmentId` (ids are in `needt_get` with `type: task`). The file is deleted for good, so it needs `confirm: true`. `POST /api/connect/ops/task.detach`                                                                                                                        |
| `needt_create_event`         | `needt.write`                                  | Event in a Needt calendar (personal workspace only; provider calendars refused)                                                                                                                                                                                                                               |
| `needt_create_page`          | `needt.write`                                  | Page with a Markdown or plain-text body, optionally under `parentId`                                                                                                                                                                                                                                          |
| `needt_append_page`          | `needt.write`                                  | Append Markdown or plain text to a page you can edit                                                                                                                                                                                                                                                          |
| `needt_log_habit`            | `needt.write`                                  | Mark a habit kept for a day (default today), or not with `kept: false`; future days refused                                                                                                                                                                                                                   |
| `needt_create_personal_time` | `needt.write`                                  | Keep time for the person (lunch, break, walk, dinner, gym, party, rest, custom); no task is ever scheduled in it. See Personal time                                                                                                                                                                           |
| `needt_mark_event_personal`  | `needt.write`                                  | Mark a calendar event (synced or local) as personal time; a linked block, the event is untouched                                                                                                                                                                                                              |
| `needt_update_personal_time` | `needt.write`                                  | Change a block's title, emoji, tint, time or repeat                                                                                                                                                                                                                                                           |
| `needt_delete_personal_time` | `needt.write`                                  | Remove a block (a whole repeat); kept, so the `actionId` undoes it                                                                                                                                                                                                                                            |
| `needt_list_memories`        | `needt.read`                                   | What Needt has learned about the person, with source and dates, and whether "Let Needt learn about me" is on                                                                                                                                                                                                  |
| `needt_update_memory`        | `needt.write`                                  | Edit one memory line (`content`, `kind`)                                                                                                                                                                                                                                                                      |
| `needt_forget_memory`        | `needt.write`                                  | Delete one memory by `id`, or all of them in the workspace with `all: true, confirm: true`                                                                                                                                                                                                                    |

| `needt_blocking` | `needt.read` | Focus blocking (Pro): `view: "active"` what is blocked now and why, `view: "profiles"` every profile. See Focus blocking |
| `needt_blocking_profile` | `needt.write` | Create, update (only the fields given) or delete a focus blocking profile |
| `needt_reminders` | `needt.read` for `list`, else `needt.write` | Reminders: `list`, `set` (on a task, an event, or on its own), `update`, `snooze` (`until`), `delete`. See Reminders |
| `needt_create_goal` | `needt.write` | Create a goal (Pro). See Goals |
| `needt_update_goal` | `needt.write` | Change a goal, record a check-in (`checkIn`), change its weekly check-in (`checkInSchedule`) or archive it (`archive: true`). See Goals |
| `needt_convert_task_to_goal` | `needt.write` | Turn a task into a goal; its subtasks become linked tasks (Pro, one undo). See Goals |

`needt_create_task`, `needt_schedule`, `needt_reschedule` and `needt_control`
run the connector routes in-process with the caller's own token, so auth,
workspace scoping and confirmation rules are the routes' own. The other write
tools call the services the app's own routes use (task update, page write
path, habit completion, local events) after resolving the workspace with an
editor role, so validation, plan limits and side effects match the app. Pages
and blocks written through MCP are marked as AI-authored. MCP calls are not
metered as AI actions.

### Admin read (`needt.admin.read`)

Read-only access to what the Admin area shows, for an admin's own AI client,
without sharing a password. There are no admin write tools: nothing here can
grant a plan, toggle a flag, delete or impersonate anyone.

- **Opt-in at consent, never default.** The consent screen shows the box
  "Read admin data: users, sign-ups, plans, flags, logs and bug reports" only
  when the signed-in person is an admin right now, and it starts unticked.
  It is offered even when the client did not ask for the scope (claude.ai
  asks only for what the challenge names). The decision re-reads the role; a
  non-admin's tick is ignored. A personal `needt_…` token never carries it.
- **Role re-checked on every call.** Each `needt_admin_*` call reads the
  account again (active, role `admin`, confirmed email where required). A
  demoted or deactivated admin gets `403` at once, even with a live token.
  Without the scope the call gets `403 insufficient_scope`.
- **Hidden without the scope.** `tools/list` shows the admin tools only to a
  token that carries `needt.admin.read`.
- **Audited and limited.** Every admin read writes an `mcp.admin_read` row to
  the admin audit log (tool, token kind, client id, filters) before the data
  is returned. Admin calls are limited to 30 a minute per person, on top of
  the general limits.
- **No secrets.** Output is built field by field from the admin pages' own
  services: no password hash, token, provider account id, payment id or
  secret. Log metadata keys that look like credentials are dropped; long text
  is cut.

| Tool                   | Reads (same service as the admin page)                                                                                                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `needt_admin_overview` | Overview: total users, sign-ups today (UTC) and in 7 days, confirmed vs unconfirmed email, Pro, Lifetime, active trials, Free, waitlist, `signupsOpen`, flag states; `mrr` is `null`                 |
| `needt_admin_users`    | Users: search by part of an email (empty = newest), `page`/`limit` ≤ 50: id, email, name, role, plan, created, verified, last sign-in. `userId` gives one account and its audit trail                |
| `needt_admin_flags`    | Feature flags incl. `signups_open`: key, on/off, rollout %, description, override count, known, persisted                                                                                            |
| `needt_admin_logs`     | `kind: app` (default) the log viewer, filter `level`, `source`, `search`, `from`/`to`; `kind: audit` the admin audit log; `kind: jobs` Operations (queues, cron, failed runs, services). Paged, ≤ 50 |
| `needt_admin_reports`  | Bug reports, newest first, filter `status`; attachment names and sizes, never bytes. Paged, ≤ 50                                                                                                     |

Grant it to claude.ai (owner steps):

1. claude.ai → Settings → Connectors → Needt → Disconnect (an existing grant
   keeps its old scopes; it has to be made again).
2. Connect Needt again (`https://mcp.needt.app/mcp`) and sign in to Needt as
   the admin account.
3. On the consent screen tick **Read admin data: users, sign-ups, plans,
   flags, logs and bug reports**, pick the workspace, press **Allow**.
4. In a chat, ask Claude to run `needt_whoami`: `token.scopes` lists
   `needt.admin.read`, and the `needt_admin_*` tools appear.

To withdraw it, disconnect the app in Settings › Connected apps, or remove
the admin role. A client that refreshes with a narrower `scope` drops the
admin scope; reconnect to get it back.

### Limits

| Limit                   | Per minute |
| ----------------------- | ---------- |
| Every call, per person  | 120        |
| Write tools, per person | 30         |
| Admin tools, per person | 30         |
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

### Done ends focus, and `fullTime`

When a task is marked done by any path (the app, `PUT /api/tasks/:id`,
`needt_complete_task`, `needt_update_task`, `/api/connect/control`) and a Focus
session is running or paused on it, the session ends as completed early: the
minutes are booked to the task (`actualFocusedMinutes`), the rest of its block
is released and the scheduler re-runs, and every open client drops the timer.
Breaks are unaffected.

`fullTime` (boolean or `null`, on create and update) is "do for the full time"
(for example 30 minutes of German). `true` keeps the session running its whole
length when the task is ticked; `false` ends it at once; `null` (the default) is
auto: `true` for a task linked to a habit or a repeating task, `false` for any
other. The task row returns the stored value (`null` when auto).

## Place and pin a task

The scheduler places tasks by itself. A caller can place one instead, the way
dragging it onto the calendar does in the app:

- `start`: ISO 8601, with an offset (`2026-10-25T14:00:00+02:00`) or a
  wall-clock time read in the person's time zone (`2026-10-25T14:00`). The
  task is placed there for `estimatedMinutes` (30 without an estimate),
  pinned (`scheduleLocked`), taken off the scheduler, and its due day becomes
  that day. A blocked-out time is refused.
- `pinned: true` pins it at the time it already has; `pinned: false` unpins it
  and hands it back to the scheduler.
- `autoSchedule: false` takes it out of the scheduler without placing it.

`POST /api/connect/tasks` takes `start` and `autoSchedule`.
`PATCH /api/connect/tasks/:id` takes every `needt_update_task` field (needs
`needt.write`):

```bash
curl -X PATCH http://localhost:3000/api/connect/tasks/TASK_ID \
  -H "Authorization: Bearer $NEEDT_TOKEN" -H "Content-Type: application/json" \
  -d '{ "start": "2026-10-25T14:00", "estimatedMinutes": 60 }'
# -> { "changed": true, "task": { "scheduledStart": "…", "scheduleLocked": true, "scheduledBlocks": [ … ] } }
```

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

## Export a page

```
GET /api/pages/:id/export?format=md
```

Returns the page as a Markdown file (`text/markdown; charset=utf-8`,
`Content-Disposition: attachment`, `Cache-Control: no-store`): the title as the
first heading, then the blocks.

Like the rest of `/api/pages/*` it answers the signed-in session (the browser,
or `curl` with the session cookie); it is not one of the bearer-token
`/api/connect/*` routes.

```bash
curl -OJ "http://localhost:3000/api/pages/PAGE_ID/export?format=md" \
  -H "Cookie: $NEEDT_SESSION_COOKIE"
```

- **Access** is the page's own: the same check as `GET /api/pages/:id`. Anyone
  who can read the page can export it (a viewer included); a page the caller
  cannot read answers `403 {"error":"Page access denied"}`, a missing or
  trashed one `404 {"error":"Page not found"}`; no session is `401`.
- **What comes out**: headings, paragraphs, bulleted, numbered and check lists
  (nested), quotes, code (fenced, with its language), rules, images, tables
  (GFM) and links. A Callout is a quote that starts with its icon, a Toggle is
  `<details><summary>`, Columns are written one after another, a highlight is
  `==text==`, an underline `<u>text</u>`; text colour is dropped and the words
  stay. Files, images and page links are absolute addresses on this host
  (`NEXTAUTH_URL`); a stored address that is not `http(s)`, `mailto:` or an app
  path is written as plain text.
- `format` defaults to `md`. `format=pdf` answers `400` and names the editor:
  PDF is the browser's print of the open page (Page options, Export as PDF),
  there is no server-side PDF. Any other value answers `400`.
- The editor's **Export as Markdown** writes the same file from the text on
  screen, unsaved edits included.

## Append to a page

```
POST /api/pages/:id/append
{ "text": "## From yesterday\n\nCall Anna", "format": "markdown" }
```

Adds the text to the end of a page you can edit; earlier content is kept and
the previous version stays in the page history. `format` is `markdown`
(default) or `plain`. Answers `{ "page": {...}, "appendedBlocks": 2 }`.
It answers the signed-in session, like the rest of `/api/pages/*`.

- `400` for an empty text or one over 100000 characters, `403` for a page you
  cannot edit, `404` for a missing one, `409` while the page is being edited
  live (try again once the editor has saved).
- Home's **End day** uses it to put a note for tomorrow into tomorrow's daily
  note ("Daily note · 2 September 2026").

## Daily highlight

The one task a person picked as the main thing of a day. Stored per user,
workspace and day; the day is the person's own, as `YYYY-MM-DD`, so no time
zone is guessed on the server. Like the rest of `/api/*` it answers the
signed-in session.

```
GET    /api/highlight?date=2026-10-18
PUT    /api/highlight            { "date": "2026-10-18", "taskId": "..." }
DELETE /api/highlight?date=2026-10-18
```

All three answer `{ "highlight": { "date", "taskId", "task": { "id", "title",
"status", "dueDate", "estimatedMinutes" } } }`, or `{ "highlight": null }` when
none is set (or its task went to Trash). `PUT` replaces the day's pick; the
task must be live and in the caller's scope (`404` otherwise). `DELETE` is safe
to repeat. `400` for a `date` that is not `YYYY-MM-DD`. Writes need the Editor
role; reading needs none beyond membership.

## Week focus

**Session only.**

The up to three focuses a person picks in the Sunday review for the week
ahead. They are the first candidates for that week's daily highlight (Home
offers a task that matches one before any other). Stored per user, workspace
and week; `weekStart` is the first day of the week as the person sees it
(`YYYY-MM-DD`, their own week start), so no time zone or week rule is guessed
on the server.

```
GET /api/week-focus?weekStart=2026-10-26
PUT /api/week-focus   { "weekStart": "2026-10-26",
                        "focuses": [{ "title": "Ship the landing", "taskId": "..." },
                                    { "title": "German B1", "projectId": "..." }] }
```

Both answer `{ "weekFocus": { "weekStart", "focuses": [{ "title", "taskId", "projectId" }] } }`,
or `{ "weekFocus": null }` when nothing was picked for that week. `focuses`
holds 1 to 3 entries. Each is a reference to one open task (`taskId`) or one
project (`projectId`), with `title` as a snapshot of its name when it was
picked. A `taskId` must be a live task and a `projectId` a project in the
caller's scope (`404` otherwise). Entries saved before references existed (a
bare title) are still read, with both ids `null`; they point at nothing. `PUT`
replaces the week's list. `400` for a `weekStart` that is not `YYYY-MM-DD` or a
list that is empty or longer than three. Writes need the Editor role; reading
needs none beyond membership.

## Highlight suggestions (Pro)

```
POST /api/ai/highlight-suggestions
     { "date": "2026-10-19",
       "candidates": [{ "id": "...", "title": "...", "due": "2026-10-19",
                        "priority": "high", "minutes": 60, "focus": true }] }
```

Asks the hosted (or own-key) AI to pick 2 or 3 of the given tasks as the
day's highlight and give each a one-line reason. Answers
`{ "status": "ready", "suggestions": [{ "taskId", "reason" }] }`, or
`{ "status": "unavailable" | "upgrade", "suggestions": [] }` when no AI can
answer or the account is Free (the client then falls back to its own order
without a model). Only ids from `candidates` are returned; at most 12
candidates are read. It counts as one AI action and is limited to 6 requests
an hour per account.

## Widgets: today, highlight, habits

Reads for a phone widget or a dashboard, answered to a personal `needt_...`
token or an OAuth grant like the other `/api/connect/*` routes: `needt.read`
for the `GET`s, `needt.write` (Editor role) for the toggle. Personal tokens act
in the person's default workspace; send `X-Workspace-Id` to pick another. An
OAuth grant stays inside its bound workspace. All answers are
`Cache-Control: private, no-store`.

"Today" is the day in the time zone saved in Settings (UTC if none): the same
day the Habits screen counts, whatever the server's or the caller's zone is.
Weeks start on the person's `weekStartDay`.

```
GET  /api/connect/today
GET  /api/connect/highlight?date=2026-10-19
GET  /api/connect/habits/today
POST /api/connect/habits/:id/toggle-today      { "completed": true }   (body optional)
```

### `GET /api/connect/highlight`

`{ "date", "highlight" }`. `date` is `YYYY-MM-DD` and defaults to the person's
today (`400` for anything else). `highlight` is `null` when none is set or its
task is in Trash, else `{ date, taskId, title, done, start, end,
durationMinutes, href }` (`start`/`end` are the task's slot, or null). It reads
the same rows as `/api/highlight`, which only answers the browser session.

### `GET /api/connect/habits/today`

`{ "date", "timeZone", "habits": [...] }`, active habits oldest first:

```json
{
  "id": "h1",
  "title": "Walk",
  "icon": "🚶",
  "color": null,
  "kind": "weekly",
  "target": { "perWeek": 3, "daysOfWeek": [], "quota": null, "at": null },
  "scheduledToday": true,
  "doneToday": true,
  "todayCount": 1,
  "week": { "start": "2026-10-19", "done": 1, "target": 3 }
}
```

`kind` is `days` when the habit is pinned to weekdays (`daysOfWeek`, 0 =
Sunday), `weekly` for N times a week. `scheduledToday` says whether today is
one of its days. `todayCount` is 0 or 1: a habit day is kept or not. `icon` is
whatever the person picked, an emoji or a glyph name.

### `POST /api/connect/habits/:id/toggle-today`

Flips today's check-in and answers `{ habitId, date, completed }`. With
`{ "completed": true | false }` it sets the state instead, so a retry is safe.
`404` for a habit that is not the caller's active habit in the workspace.

### `GET /api/connect/today`

One request for a widget:

```json
{
  "generatedAt": "2026-10-19T08:00:00.000Z",
  "timeZone": "Europe/Kyiv",
  "date": "2026-10-19",
  "counts": { "open": 3, "done": 2, "total": 5 },
  "next": { "id", "title", "start", "end", "durationMinutes", "due", "overdue", "href" },
  "tasks": [ /* up to 6 open, same shape as next */ ],
  "highlight": { "taskId", "title", "done", "start", "end", "durationMinutes", "href", "date" },
  "habits": [ /* as above */ ],
  "event": { "id", "title", "start", "end", "location", "allDay" },
  "personalBlock": { "blockId", "kind", "title", "emoji", "start", "end" },
  "freeMinutes": 360,
  "workLeftMinutes": 480,
  "weather": { "city", "temp", "min", "max", "code", "summary", "line": "3° Rain in Tokyo" }
}
```

- **Open** is a task that is not done, not habit work, with a slot today or a
  deadline today or earlier (overdue included). **Done** is closed today.
  Order: slots running or still ahead, then untimed, then slots already past.
  `next` is the first one, or `null`. `href` is an app path (`/tasks?task=<id>`).
- `event` is the next synced calendar event that has not ended (all-day only if
  nothing timed is coming), within a week; `null` in a shared workspace.
  `personalBlock` is the next protected personal-time block that ends today
  (repeats included).
- `freeMinutes` is what is left of today's working window (Settings, working
  hours) after task slots, events and personal time, counted from now; `0` on a
  non-working day. `workLeftMinutes` is the window still ahead (the bar's
  whole), so `freeMinutes / workLeftMinutes` is how open the rest of the day is.
- `weather` needs a City in Settings; otherwise `null`, as it is when the
  weather service is down.

```bash
curl https://use.needt.app/api/connect/today \
  -H "Authorization: Bearer needt_..."
```

## Stats

**Session only.**

```
GET /api/stats?range=week|month
```

What the signed-in person closed over the last 7 (`week`, the default) or 30
(`month`) days, ending on their today in their saved time zone. Scoped to the
user and the current workspace: only live (not Trashed) tasks of that scope
count, and Focus minutes are the person's own. Answers `400` for any other
`range`. Not cached (`Cache-Control: private, no-store`).

```json
{
  "range": "week",
  "from": "2026-08-26",
  "to": "2026-09-01",
  "timeZone": "Europe/Kyiv",
  "total": 11,
  "days": [{ "date": "2026-08-26", "done": 2, "focusMinutes": 50 }],
  "bestDay": "2026-08-28",
  "byProject": [
    { "projectId": "p1", "name": "Launch", "color": "#7c6ff7", "done": 6 },
    { "projectId": null, "name": "No project", "color": null, "done": 5 }
  ],
  "byWeekday": [{ "weekday": 0, "done": 1 }],
  "bestWeekday": 3,
  "focusMinutes": 140,
  "focusSessions": 4
}
```

- `days` is oldest first, one row per day, zeros included.
- `bestDay` and `bestWeekday` (0 = Sunday) are `null` when nothing was closed;
  with a tie the latest day wins.
- `byProject` is most first; tasks without a project are one "No project" row.
- `byWeekday` always has all seven weekdays.
- `focusMinutes` is `null` (not 0) when no Focus session was stored in the
  window, so a client can hide the line. The Streak on Home is derived from the
  task list in the browser and is not part of this answer.

## Memories

"Let Needt learn about me" is a switch in Settings, **off by default**. While it
is off nothing is learned and nothing learned is used: not by Ask (answers,
Plan my day, the morning brief) and not by the scheduler. The list stays
readable and editable either way. The switch itself is turned on only in the
app (or by this API with the person's own token); the MCP tools manage the
list but have no switch, so an agent cannot opt a person in.

With the switch on Needt keeps, per user and workspace:

- **Work habits** computed from the person's own finished tasks (source
  `habit`): when focused work usually gets finished, how long tasks really take
  against the estimate (the scheduler lengthens or shortens blocks by that
  ratio, between 0.5 and 2), and which weekdays are heavy. Recomputed at most
  daily.
- **Stated preferences** the person tells Ask (source `chat`), such as "no
  meetings before 10". Ask says in its reply that it saved the line.
- **Short facts from documents and mail metadata** (sources `document`, `mail`):
  excerpts of recently edited documents and the subject and sender of recent
  mail go through the same hosted (or own-key) AI path as Ask, at most one
  action a day, at most 5 facts a pass. Mail bodies and snippets are never read.

Memory text is stored encrypted (`enc:v1`), is included in the account data
export, and is deleted with the account.

```
GET    /api/ai/memories
PATCH  /api/ai/memories   { "enabled": true }
PATCH  /api/ai/memories   { "enabled": false, "memories": "keep" | "delete" }
PATCH  /api/ai/memories   { "memoryId": "...", "content": "...", "kind": "preference" }
DELETE /api/ai/memories   { "memoryId": "..." }
DELETE /api/ai/memories   { "all": true }
```

- `GET` returns `{ "enabled", "memories": [{ id, kind, content, source,
createdAt, updatedAt }] }` for the current workspace. `kind` is `preference`,
  `pattern`, `goal` or `fact`; `source` is `chat`, `habit`, `document`, `mail`
  or `inferred`.
- `PATCH { enabled }` flips the switch. Turning it off keeps the memories
  unless `"memories": "delete"` (every workspace). Turning it on starts a first
  learning pass in the background.
- `PATCH { memoryId, content?, kind? }` edits a line. An edited line is the
  person's own and later passes no longer replace it. Text that looks like
  credentials, money or health data is refused.
- `DELETE` removes one memory, or with `all: true` every memory in the
  workspace. A deleted work-habit line is not computed again; `all: true` (or
  turning the switch off with `"memories": "delete"`) resets that.

## Morning brief

Two or three lines Ask writes for the person's day, shown at the top of Home in
the morning. Pro and Lifetime (a trial counts); a Free account always gets
`{ "brief": null }`. Written at most once per user and day, through the same
hosted (or own-key) AI path as Ask, so it counts as one AI action against the
plan's allowance and obeys the same slow and blocked modes. Cached; a dismissed
brief stays cached, so it is not written again that day.

```
GET   /api/ai/morning-brief?date=2026-10-19
POST  /api/ai/morning-brief   { "date": "2026-10-19", "facts": { ... } }
PATCH /api/ai/morning-brief   { "date": "2026-10-19", "dismissed": true }
```

- `GET` returns `{ "brief": { "date", "text", "dismissed" } | null }` and never
  generates.
- `POST` returns `{ "status", "brief" }`. `status` is `ready` (text written, or
  already cached), `pending` (another request is writing it), `unavailable` (no
  AI can answer, or the model said nothing; the day is left unclaimed) or
  `upgrade` (Free). `facts` is what the client knows of the day in the person's
  own zone: `today` (up to 6 open task titles), `openToday`, `doneToday`,
  `overdue` (up to 3 titles), `overdueCount`, `freeMinutes` (or `null`) and an
  optional `nextEvent` `{ title, at: "HH:MM" }`. Limited to 6 requests a minute.
- `PATCH` only dismisses.

## Starter game

The Starter game shows on Home, Calendar and Tasks while a person has fewer
than five open tasks. Three questions, one agent request, a board to sort, and
one undoable create.

```
GET   /api/starter-game
PATCH /api/starter-game          { "hide": "7d" | "never" | "show" }
POST  /api/starter-game/plan     { "do": "...", "burn": "...", "reg": "..." }
POST  /api/starter-game/create   { "tasks": [], "habits": [], "projects": [] }
```

- `GET` returns `{ hiddenUntil, neverShow, hidden, openTasks, eligible, canPlay }`.
  `eligible` is "fewer than five open tasks and not hidden"; `canPlay` is false on
  Free (the card shows with PRO).
- `PATCH` remembers "Not now" (`7d`, hidden for 7 days), "Don't show again"
  (`never`) or clears both (`show`).
- `plan` is the one agent request (one hosted-AI action, with Ask's caps; a
  limit of 6 a minute). It returns `{ status, items, suggestions }`. `status` is
  `ready`, `unavailable` (no AI can answer; nothing is made up) or `upgrade`
  (Free). `items` are 12 to 16 tiles `{ title, kind: task | habit | project,
suggestedGroup: today | week | habit | project, durationMinutes | perWeek |
horizon, dueDay?, firstStep? }`; `suggestions` holds up to one extra tile per
  lane. Nothing is created.
- `create` runs the op `starter.create` once: tasks (`group` today or week, with
  due dates), habits (`perWeek`) and projects (each with a first step) in one
  transaction and one AgentAction. The answer carries `actionId`; undo it with
  `POST /api/agent/actions/:id/undo`, which archives everything it made. The
  same op is callable at `/api/connect/ops/starter.create`.

## Weather

**Session only.**

```
GET /api/weather
```

Today's weather for the **City** saved in Settings (General; stored as
`prefs.city` on the user's settings). With no city saved the answer is
`{ "weather": null }` and nothing is asked of anyone. Otherwise the server asks
[Open-Meteo](https://open-meteo.com) (free, no key): the city is geocoded once
(kept for 30 days) and the forecast is cached for one hour. Only the city name
is sent to Open-Meteo; no device location is read or sent.

```json
{
  "weather": {
    "city": "Kyiv",
    "temp": 14,
    "min": 9,
    "max": 17,
    "code": 2,
    "summary": "Partly cloudy"
  }
}
```

Temperatures are whole degrees Celsius; `code` is the WMO weather code.
`weather` is also `null` when the city is unknown or Open-Meteo is down.
Home draws this next to the day's first event ("First event at 10:00"). It
does not say when to leave: Needt has no real travel time to base that on.

## Weekly review

On Sundays Home offers a short review: the week's wins (from `/api/stats`),
leftovers to move to Monday, a date or the Inbox, and three focuses for next
week. Saving it creates a page (not Private, so the assistant and MCP can read
it) titled `Weekly review · 18 October 2026` (the Sunday's date) with the
sections _Wins_, _Moved_ and _Focus for next week_, written through
`POST /api/pages` and `POST /api/pages/:id/append`. It is an ordinary page, so
it is readable and writable through the pages API and the MCP page tools like
any other; find it by title with `GET /api/pages?q=Weekly review`.
Home shows the offer once per Sunday while no page with that title exists.

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

The token needs the scope the risk implies: `needt.read` for a `read`
operation, `needt.write` for any other (so a read-only token gets `403
insufficient_scope` on every write, `task.detach` included), and `mail.read`
as well for `mail.to_task`, which copies a message into a task. Writes count
against 30 a minute per person, the same limit as `/api/mcp`.

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

| Operation                | Risk       | Input                                                                                                                                                  | Undo                                       |
| ------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| `task.list`              | read       | `status` (open, completed, all), `projectId`, `query`, `includeArchived`, `limit`                                                                      | —                                          |
| `task.get`               | read       | `taskId`                                                                                                                                               | —                                          |
| `schedule.get_day`       | read       | `date` (YYYY-MM-DD, user's time zone)                                                                                                                  | —                                          |
| `task.create`            | reversible | `title`, `notes`, `dueDate`, `priority`, `projectId`, `tagIds`, `estimateMinutes`, `start`, `autoSchedule`                                             | archives the task                          |
| `task.update`            | reversible | `taskId` plus any of `title`, `notes`, `dueDate`, `priority`, `projectId`, `tagIds`, `estimateMinutes`, `start`, `pinned`, `autoSchedule`              | writes the previous values back            |
| `task.complete`          | reversible | `taskId` (recurring series are refused for now)                                                                                                        | previous status                            |
| `task.uncomplete`        | reversible | `taskId`, `status` (todo, in_progress)                                                                                                                 | completed with its original time           |
| `task.archive`           | reversible | `taskId`                                                                                                                                               | unarchives with placement and blocks       |
| `task.unarchive`         | reversible | `taskId`                                                                                                                                               | archives again                             |
| `task.move_to_day`       | reversible | `taskId`, `date` (YYYY-MM-DD)                                                                                                                          | previous dates and blocks                  |
| `task.spread`            | reversible | `taskIds` or `scope` (today: no time today; overdue: due before today), `days` (1–14, default 7). Each task goes to the first day from today with room | every task it moved goes back              |
| `schedule.auto`          | reversible | `{}`                                                                                                                                                   | every task it moved goes back              |
| `project.create`         | reversible | `name`, `description`, `color`, `icon`                                                                                                                 | archives the project                       |
| `project.archive`        | reversible | `projectId`                                                                                                                                            | previous status                            |
| `mail.to_task`           | reversible | `messageId`, `title`, `estimateMinutes`                                                                                                                | archives the task                          |
| `habit.log`              | reversible | `habitId`, `date` (default today)                                                                                                                      | clears the day                             |
| `habit.unlog`            | reversible | `habitId`, `date` (default today)                                                                                                                      | marks the day again                        |
| `personal.list`          | read       | `from`, `to` (ISO; adds every occurrence in the range), `includeArchived`                                                                              | —                                          |
| `personal.create`        | reversible | `kind`, `title`, `emoji`, `color`, `start`, `end` or `minutes`, `rrule`                                                                                | removes the block                          |
| `personal.update`        | reversible | `blockId` plus any of `title`, `emoji`, `color`, `start`, `end`, `rrule` (null stops the repeat)                                                       | writes the previous values back            |
| `personal.delete`        | reversible | `blockId`                                                                                                                                              | brings the block back                      |
| `personal.mark_event`    | reversible | `eventId`, `kind`, `title`, `emoji`                                                                                                                    | removes the linked block                   |
| `personal.set_default`   | reversible | `kind`, `enabled`, `at` (HH:mm), `minutes`, `days` (0 = Sunday)                                                                                        | restores the previous default              |
| `goal.list`              | read       | `status` (active, achieved, dropped, all), `parentId`, `projectId`, `includeArchived`, `limit`                                                         | —                                          |
| `goal.get`               | read       | `goalId`                                                                                                                                               | —                                          |
| `goal.create`            | reversible | `title`, `description`, `deadline`, `area`, `parentId`, `projectIds`, `targetValue`, `currentValue`, `unit`, `percent`, `checkIn`                      | archives the goal                          |
| `goal.update`            | reversible | `goalId` plus any of the create fields, `status`, `position`                                                                                           | writes the previous values back            |
| `goal.archive`           | reversible | `goalId`                                                                                                                                               | brings it back                             |
| `goal.check_in`          | reversible | `goalId`, `value`, `percent`, `note` (at least one)                                                                                                    | removes the check-in, previous value back  |
| `goal.convert_from_task` | reversible | `taskId`, `area`, `parentId`                                                                                                                           | task back, goal and its new tasks archived |

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
  place it). Without `start` it does not schedule; the task is placed by
  `schedule.auto` or the next scheduler run. `notes` are sanitized like the
  app's editor.
- `start`, `pinned` and `autoSchedule` place a task by hand, with the same
  rule as `needt_update_task` and `PATCH /api/connect/tasks/:id`
  (`task.update` takes all three, `task.create` takes `start` and
  `autoSchedule`). `start` is an ISO 8601 time, with an offset
  (`2026-10-25T14:00:00+02:00`) or a wall-clock time read in your time zone
  (`2026-10-25T14:00`). The task is placed there for its estimate (30 minutes
  when it has none) and pinned, its due day becomes that day (a `dueDate` in
  the same call wins) and `autoSchedule` defaults to `false`. `pinned: true`
  pins a task that already has a time where it is (`409 CONFLICT` when it has
  none); `pinned: false` hands it back to the scheduler. `start` together
  with `pinned: false`, an unreadable time, a task nobody is assigned to, and
  a time you blocked out ("This time is blocked out") are refused with
  `INVALID_INPUT` (400) and change nothing. These ops write the task and its pinned
  block but do not run the scheduler: call `schedule.auto` afterwards to
  place a task you handed back. Undo of `task.update` writes back what the
  placement changed (`scheduledStart`, `scheduledEnd`, `scheduleLocked`,
  `isAutoScheduled`, `autoScheduled`, `scheduleScore`, the due day) and, when
  `start` replaced them, the task's previous scheduled blocks exactly; undo of
  `task.create` archives the task and releases its block.
- `schedule.auto` compares the schedule before and after it runs. A change
  made by anything else in that window is treated as part of the run and is
  undone with it.
- `habit.log` and `habit.unlog` reject days that do not exist and days after
  today in your time zone.

Pick the workspace with the `x-workspace-id` header or `?workspaceId=`, as
for the other connector routes.

## What blocks the scheduler

Busy time is every non-all-day event in every enabled calendar the person
owns: synced Google, Outlook and CalDAV calendars and the Needt local calendar
that `needt_create_event` creates on first use. A calendar made later counts
from its first event, with no settings write. Only a calendar the person
switched off (`AutoScheduleSettings.excludedCalendars`, a JSON array of feed
ids) is ignored, and the local Needt calendar cannot be switched off. All-day
events and the echo of a task block Needt itself pushed to a calendar are not
busy time. `needt_list` with `type: "calendar"` returns each calendar's
`lastSync` and its last sync `error` (null when it is healthy).

## Personal time

Time the person keeps for themselves: lunch, a break, a walk, dinner, the
gym, a party, rest, or a custom block. **The scheduler never places a task in
it**: not `schedule.auto`, not Plan my day (`POST /api/ai/plan-day`, which runs
`schedule.auto`), not the slot search behind the app's own placement. A repeat
and a block linked to a synced event count the same as a one-off block. A
person can still put a task there by hand; the app asks first.

It lives only in Needt. Nothing is ever written to Google, Outlook or iCloud,
and marking a synced event as personal does not change the event.

A block (`PersonalBlock`):

```json
{
  "id": "…",
  "kind": "lunch",
  "title": "Lunch",
  "emoji": "🍽️",
  "color": null,
  "start": "2026-10-19T13:00:00.000Z",
  "end": "2026-10-19T14:00:00.000Z",
  "rrule": "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
  "sourceEventId": null,
  "isDefault": true
}
```

- `kind` is `lunch`, `break`, `walk`, `dinner`, `gym`, `party`, `rest` or
  `custom` (a custom block needs a `title`). A preset kind fills in its title,
  emoji and usual length (lunch 60 min, break 15, walk 30, dinner 60, gym 60,
  party 180, rest 60) when you leave them out.
- `color` is a palette tint: `info`, `success` or `neutral`. Never the accent.
  There is no hue and no soft/hard flag: every block is hard, the scheduler
  never overlaps it.
- `rrule` repeats the block at the same wall-clock time in the person's time
  zone (`FREQ=DAILY`, `FREQ=WEEKLY;BYDAY=MO,TU,…`, any rule `rrule` reads).
- `sourceEventId` links a calendar event the person marked as personal. The
  block then follows the event when it moves; if the event is removed, the
  block keeps the time it had.
- `isDefault` marks the repeating defaults from Settings, Your day (one per
  kind, set with `personal.set_default`).
- Personal workspace only, like calendar events. Up to 500 blocks.

Every write is an operation (see Operations above), so it is undoable. The
app's own routes call the same operations for the signed-in session:

```http
GET    /api/personal-blocks?from=ISO&to=ISO   # blocks (+ occurrences in the range)
POST   /api/personal-blocks                   # personal.create
PATCH  /api/personal-blocks/:id               # personal.update
DELETE /api/personal-blocks/:id               # personal.delete
POST   /api/personal-blocks/mark-event        # personal.mark_event
POST   /api/personal-blocks/defaults          # personal.set_default
```

```bash
curl -X POST http://localhost:3000/api/connect/ops/personal.create \
  -H "Authorization: Bearer needt_REPLACE_ME" \
  -H "Content-Type: application/json" \
  -d '{ "kind": "lunch", "start": "2026-10-19T13:00:00.000Z",
        "rrule": "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR" }'
```

Ask can do the same in words ("block Friday evening for a party"), with Undo.
In MCP, `needt_list` and `needt_get` take `type: "personal_time"`.

## Goals

What a person is working towards: a title, a why (`description`, plain text
or the task editor's rich text), an optional `deadline`, a life `area`
(`work`, `money`, `health`, `learning`, `home`, `relationships`, `personal`,
or a custom label up to 40 characters) and a `status` (`active`, `achieved`,
`dropped`). A goal is **never a task**: the scheduler, Focus, Today, the
overdue lists and Plan my day never read goals. Only the tasks linked to a
goal are planned.

- **Subgoals** go one level deep (`parentId` names a top-level goal).
- **Projects**: `projectIds` links projects; every task in them counts towards
  the goal. A project's header shows its goals.
- **Tasks**: `goalId` on `POST /api/connect/tasks`, `PATCH
/api/connect/tasks/:id`, `task.create`, `task.update`, `needt_create_task`
  and `needt_update_task` links one task (null unlinks). Linking needs no
  plan.

Progress (`progress` on every goal) comes from, in this order:

1. linked tasks, directly or through a linked project: closed / total
   (`source: "tasks"`, `done`, `total`; archived, trashed and finished
   repeat records do not count);
2. the goal's own manual value: `currentValue / targetValue` (with `unit`,
   e.g. 2 500 / 2 500 CHF) or `percent` 0–100 (`source: "manual"`);
3. the average of its subgoals, a dropped one left out, one with no progress
   counted as zero (`source: "subgoals"`);
4. nothing yet (`source: "none"`, `ratio: null`).

An achieved goal reads 100%.

```json
{
  "id": "…",
  "title": "Save 2 500 CHF",
  "description": "So a broken laptop is not a crisis",
  "deadline": "2026-12-31T00:00:00.000Z",
  "area": "money",
  "status": "active",
  "parentId": null,
  "projectIds": ["…"],
  "childIds": [],
  "targetValue": 2500,
  "currentValue": 1000,
  "unit": "CHF",
  "manualPercent": null,
  "checkIn": { "enabled": true, "weekday": 1, "hour": 9, "lastAt": null },
  "progress": {
    "source": "manual",
    "ratio": 0.4,
    "percent": 40,
    "done": 0,
    "total": 0,
    "current": 1000,
    "target": 2500,
    "unit": "CHF"
  },
  "href": "/goals?goal=…"
}
```

**Weekly check-in.** Once a week per goal (default Monday 09:00 in the
person's time zone; `checkIn: { enabled, weekday (0 = Sunday), hour }`)
Needt asks "How's <goal>?" as a nudge in Notifications (and a push, when
nudges are on). The answer, `goal.check_in` (`value`, `percent`, `note`), is
kept as a dated history entry and its value or percent becomes the manual
progress; `goal.get` returns the last 20.

**Convert a task.** `goal.convert_from_task` makes a goal from a task: its
title (a leading `GOAL:` is dropped), description, due date as deadline and
project as a linked project. Each subtask becomes a task linked to the goal
(ticked ones stay done) and the original task is archived. One undo puts the
task back and archives the goal and the new tasks; it is refused as a
conflict when one of them was changed since.

**Plan.** Goals are Pro: on Free, creating and converting answer `403
UPGRADE_REQUIRED`. Goals made before a downgrade stay readable, editable and
closable, but get no check-ins.

The app's routes take the session or a `needt_` token (`needt.read` to read,
`needt.write` to change); every write answers with an `actionId`:

```http
GET    /api/goals?status=&parentId=&projectId=&includeArchived=   # goal.list
POST   /api/goals                                                  # goal.create
GET    /api/goals/:id                                              # goal.get
PATCH  /api/goals/:id                                              # goal.update
DELETE /api/goals/:id                                              # goal.archive
GET    /api/goals/:id/check-ins                                    # last 20
POST   /api/goals/:id/check-ins                                    # goal.check_in
POST   /api/goals/convert-task                                     # goal.convert_from_task
POST   /api/goals/:id/tasks           { title } | { taskId }       # task.create / task.update with goalId
PATCH  /api/goals/:id/tasks/:taskId   { done } | { linked: false } # task.complete / uncomplete / unlink
```

In MCP, `needt_list` and `needt_get` take `type: "goal"`; `needt_get`
returns `{ goal, subgoals, tasks, checkIns }`.

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

Undo changes data, so a token needs `needt.write` to call either undo route.

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
      "unread": true,
      "entity": null
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
| `reminder`     | activity  | A reminder that has come due (`at` is when it fired)          |
| `overdue`      | activity  | A task past its due date (up to 14 days back)                 |
| `reminder`     | reminders | A pending reminder, with the time it fires in `at`            |
| `due`          | reminders | A task due within the next two days                           |

`entity` is `{ "type": "task" | "event" | "reminder", "id" }` when the row is
about one, so a tool can complete the task; reminder rows also carry
`reminderId` for `/api/connect/reminders/:id`.

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

Snooze rows (the bell's "Tomorrow"): they are hidden until `until` and come
back unread. For a reminder row, snooze the reminder itself instead
(`PATCH /api/connect/reminders/:id` with `snoozeUntil`), so it fires again.

```bash
curl -X POST http://localhost:3000/api/connect/notifications/snooze \
  --oauth2-bearer "$NEEDT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "keys": ["overdue:TASK_ID:1761552000000"], "until": "2026-10-28T09:00:00+01:00" }'
```

The app itself reads the same feed from `GET /api/notifications?feed=1` (same
query) and marks with `POST /api/notifications/read`, using the signed-in
session instead of a token. `GET /api/notifications` without `feed=1` is the
older nudge delivery the corner tip uses; it marks what it returns as
delivered, so do not poll it from a script. `GET /api/notifications/alerts?channel=mac&since=ISO`
returns what may interrupt now on that channel after Settings → Notifications
(type switches, channel, quiet hours, daily digest); the Mac app polls it.

## Reminders

A reminder is on a task (`taskId`), a calendar event (`eventId`), or on its
own (`title` and `at`). The worker fires it on time as a push, a Mac
notification or an email, as Settings → Notifications allow, and it lands in
the bell's Activity either way.

```bash
# 10 minutes before the task starts
curl -X POST http://localhost:3000/api/connect/reminders \
  --oauth2-bearer "$NEEDT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "taskId": "TASK_ID", "offsetMinutes": 10 }'
# 1 day before, at 09:00 in your time zone
#   -d '{ "taskId": "TASK_ID", "offsetMinutes": 1440, "atTime": "09:00" }'
# an hour before the deadline
#   -d '{ "taskId": "TASK_ID", "anchor": "deadline", "offsetMinutes": 60 }'
# at a time, on its own
#   -d '{ "title": "Call the tax office", "at": "2026-10-28T14:00:00+01:00" }'
```

Returns `201` with the reminder: `id`, `taskId`, `eventId`, `title`, `kind`
(`BEFORE_START`, `BEFORE_DEADLINE`, `AT_TIME`), `anchor`, `offsetMinutes`,
`atTime`, `at`, `firesAt` (snooze included), `snoozedUntil`, `status`,
`label` ("1 day before, 09:00") and `link`. Setting the same reminder twice
returns the one that exists. Free has one reminder per task or event; a
second is a `403` with `UPGRADE_REQUIRED`.

- `GET /api/connect/reminders?taskId=&eventId=&status=all` lists them
  (upcoming by default, soonest first).
- `GET`, `PATCH`, `DELETE /api/connect/reminders/:id`. `PATCH` takes the same
  timing fields, or `{ "snoozeUntil": ISO }` to fire again then
  (`null` clears it).

Relative reminders follow their task or event: move it and the reminder
moves; a reminder already fired on a meeting that moves later fires again. A
completed task's reminders do not fire. The app uses the same routes at
`/api/reminders` with the signed-in session.

## Quick-add parsing

Pro. Session or bearer token. Saves nothing: it turns a line of text into
task fields, so every surface (browser extension, island, bots, scripts)
reads quick-add the same way.

```bash
curl -X POST https://use.needt.app/api/quick-add/parse \
  -H "Authorization: Bearer $NEEDT_TOKEN" -H "Content-Type: application/json" \
  -d '{ "text": "Call Anna tomorrow at 3pm 30m #Work !high" }'
```

```json
{
  "title": "Call Anna",
  "start": "2026-10-22T12:00:00.000Z",
  "estimatedMinutes": 30,
  "priorityLevel": "HIGH",
  "project": "Work",
  "tokens": [{ "kind": "date", "text": "tomorrow at 3pm", "index": 10 }, …],
  "timeZone": "Europe/Kyiv"
}
```

- Dates and times are parsed in English, Russian, Ukrainian, German, French,
  Spanish, Italian, Portuguese and Dutch (chrono-node), in `timeZone` (default:
  the person's own).
- A time gives `start`; a day without a time gives `deadline` at the end of
  that day.
- `2h`, `90m`, `1.5ч`, `30 мин` give `estimatedMinutes`.
- `!low`, `!medium`, `!high`, `!urgent` (or `!1`–`!4`) give `priorityLevel`.
- `#name` gives `project`, which the caller matches to a project id.
- `tokens` lists what was read, with each token's position in the original
  text, so inputs can highlight them.

## Energy curve

Pro, behind the `energy_curve` flag (404 while off, 403 `UPGRADE_REQUIRED` on
Free). Session or bearer token.

A chronotype gives the scheduler an energy level for each hour of the day.
Heavy tasks go to the peak and light ones to the dip. Energy hours a person
sets by hand (Settings, Your day) always win over the curve. Hours are read
on the person's own clock.

| `chronotype` | High  | Dip (low) | Second rise  |
| ------------ | ----- | --------- | ------------ |
| `lark`       | 6–10  | 12–14     | 14–17 medium |
| `neutral`    | 9–12  | 13–15     | 15–18 medium |
| `owl`        | 15–20 | 13–15     | 20–23 medium |

```bash
curl -X PUT https://use.needt.app/api/energy/profile \
  -H "Authorization: Bearer $NEEDT_TOKEN" -H "Content-Type: application/json" \
  -d '{ "chronotype": "owl" }'
# -> { "chronotype": "owl", "curve": [{ "start": 10, "end": 13, "energy": "medium" }, …] }
```

`GET` reads it, and `DELETE` goes back to the plain morning default.

## Focus blocking

Pro, behind the `focus_blocking` flag (404 while it is off, 403
`UPGRADE_REQUIRED` on Free). Needt decides what to block; the browser
extension and the Mac app enforce it. Every route takes the web session or a
bearer token (`needt.read` to read, `needt.write` to change).

A profile is a list of `sites` (host names; `*.example.com` also covers
subdomains; URLs are reduced to their host) and `apps` (macOS bundle ids),
with a `mode`: `BLOCKLIST` blocks what is listed, `ALLOWLIST` blocks
everything else. It holds while any of its triggers does:

- `onFocusSession`: a focus session is running;
- `eventKeywords`: a calendar event under way has one of the words in its
  title (case-insensitive; all-day and declined events do not count);
- `calendarFeedIds`: any event under way on those calendars;
- `projectIds`: a scheduled block of an open task in those projects is under way.

```bash
curl -X POST https://use.needt.app/api/blocking/profiles \
  -H "Authorization: Bearer $NEEDT_TOKEN" -H "Content-Type: application/json" \
  -d '{ "name": "Deep work", "sites": ["youtube.com", "x.com"],
        "onFocusSession": true, "eventKeywords": ["deep work"] }'
```

`GET /api/blocking/profiles` lists them, `PATCH /api/blocking/profiles/:id`
changes the fields given, `DELETE` removes one. At most 20 profiles, 500
entries per list.

`GET /api/blocking/active` is what to block right now:

```json
{
  "active": true,
  "mode": "BLOCKLIST",
  "sites": ["x.com", "youtube.com"],
  "apps": [],
  "until": "2026-10-21T15:30:00.000Z",
  "profiles": [
    {
      "id": "…",
      "name": "Deep work",
      "reason": {
        "kind": "event",
        "id": "…",
        "title": "Deep work: launch",
        "until": "2026-10-21T15:30:00.000Z"
      }
    }
  ]
}
```

When several profiles hold, their lists are merged; if any of them is an
`ALLOWLIST`, only the allow lists apply. `until` is when the earliest reason
ends (poll again then); `null` while only an open-ended focus session holds.
`reason.kind` is `focus_session`, `event` or `task_block`.

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

## Task view

One setting says how every task list is drawn (Home, Tasks, project pages, the
Calendar, the phone). It lives in the user settings, under `prefs.taskView`,
and is read and written with `GET` / `PATCH /api/user-settings`:

```bash
curl -s https://needt.app/api/user-settings
# → { "prefs": { "taskView": { "completed": "today", … } }, … }

# `prefs` replaces the whole stored map: send it back with your change merged in
curl -X PATCH -H "Content-Type: application/json" \
  -d '{ "prefs": { "taskView": { "completed": "hide", "sort": "priority" } } }' \
  https://needt.app/api/user-settings
```

| Key            | Values                        | Default | Meaning                                                                                                                                                                                            |
| -------------- | ----------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `completed`    | `hide`, `today`, `always`     | always  | A ticked task leaves the lists at once / stays until the end of the day / stays                                                                                                                    |
| `subtasks`     | `next`, `all`, `count`        | next    | Row detail: the next step under the title with a tap to unfold the rest / every step open / just the count (`0/3`). The first version stored a boolean: `true` reads as `next`, `false` as `count` |
| `duration`     | boolean                       | true    | Row detail: the estimated length                                                                                                                                                                   |
| `project`      | boolean                       | true    | Row detail: the project                                                                                                                                                                            |
| `sort`         | `time`, `priority`, `due`     | time    | Order inside every list                                                                                                                                                                            |
| `group`        | `date`, `project`, `priority` | date    | Tasks only: what the sections are (Home and the Calendar keep their days)                                                                                                                          |
| `overdueFirst` | boolean                       | true    | Overdue tasks first, in a section of their own                                                                                                                                                     |

Missing keys take their default; an unknown key or value is a `400`. "Until the
end of the day" counts from the task's `completedAt`.

Steps are numbered by position: the task's `entry` (its first two-minute step),
when it has subtasks, is Step 1, and its subtasks follow in order. Ticking a
step in a list is the same write as `needt_complete_subtask`.

## Time zone, week start and clock

`timeZone` (IANA), `weekStartDay` (`monday` / `sunday`) and `timeFormat`
(`12h` / `24h`) are columns of the same `/api/user-settings` row. A new account
starts in the zone its browser reports: `POST /api/auth/register` (and the
first-run `POST /api/setup`) take optional `timeZone` and `locale` (a BCP 47
tag such as `de-DE`; the week start and clock are derived from it). An account
that still sits at the `UTC` default is moved once, on its first signed-in
load, to the browser's zone, and a still-default Sunday / 12h follows the
browser language. `prefs.tzAutoSet: true` records that this has happened; a
client that sets the zone itself should set it too, so nothing replaces the
value later.

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

### Comments on a reference

```http
GET    /api/moodboards/:id/items/:itemId/comments
POST   /api/moodboards/:id/items/:itemId/comments            { "body": "..." }
PATCH  /api/moodboards/:id/items/:itemId/comments/:commentId { "resolved": true }
DELETE /api/moodboards/:id/items/:itemId/comments/:commentId
```

Same session and workspace rules as the items. A viewer reads; an editor
(and above) posts; the comment's author, or someone with full access, resolves,
reopens and deletes. There is no separate commenter role: writing a comment
needs editor access, as it does for page comments. `body` is 1 to 4,000
characters after trimming; anything else in the body is a `400`. A board in
Trash is read-only (`409`). The list is open comments first, then resolved,
oldest first within each, at most 500; each comment carries `id`, `itemId`,
`moodboardId`, `authorId`, `author { name, email, image }`, `body`,
`resolvedAt` and `createdAt`. Responses are `{ "comments": [...] }` and
`{ "comment": {...} }` (`201` on create); `DELETE` answers `204`. Deleting the
reference deletes its comments. The board's owner, and anyone who commented on
the board before, gets a "commented on <board>" card in their notifications.

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

## First-run examples

New accounts finish setup on Today with a sample day. Every object it creates
(one project, six tasks, a "Start here" document, one habit) carries
`isSample: true` in the database. Examples never count toward a plan limit:
`GET /api/habits` lists the sample habit, but Free's three-habit allowance
skips it, and the examples are never auto-scheduled.

The same first run also keeps Lunch for the new account (personal time, weekdays
13:00-14:00, `isDefault: true`). It is not an example, so clearing the examples
leaves it; the person edits it under Settings, Your day. Existing accounts get
nothing.

```http
GET    /api/connect/onboarding/sample   # needt.read
POST   /api/connect/onboarding/sample   # needt.write
DELETE /api/connect/onboarding/sample   # needt.write
```

The same three routes exist under `/api/onboarding/sample` for the signed-in
session (the app uses those). Writes need the Editor role in the workspace.

- `GET` answers `{ "present": true, "counts": { "tasks": 6, "projects": 1, "pages": 1, "habits": 1 } }`.
  `present` is false once there is nothing left to clear.
- `POST` creates the sample day in one transaction. Body, all optional:
  `{ "uses": ["study", "personal"], "timeZone": "Europe/Berlin" }`. `uses` takes
  `work`, `study`, `personal` and `side`; **the first entry picks the sample**
  (default `work`) and each use is a different day. `timeZone` defaults to the
  saved setting. Answers `201` with
  `{ "created": true, "use": "study", "projectId": "…", "pageId": "…", "counts": { … } }`.
  It runs once per account: a repeat call, a call after `DELETE`, and a call by
  any account that existed before the feature all answer `200` with
  `{ "created": false, … }` and change nothing. An unknown `uses` entry or
  field answers `400`.
- `DELETE` removes every example still on the account, and only those:
  `{ "removed": { "tasks": 6, "projects": 1, "pages": 1, "habits": 1 } }`. A
  task you added yourself to the sample project stays and leaves the project.
  Safe to repeat. In the app it is the "Clear examples" button on Today and
  under Settings, Data.

```bash
curl -X POST http://localhost:3000/api/connect/onboarding/sample \
  -H "Authorization: Bearer needt_REPLACE_ME" \
  -H "Content-Type: application/json" \
  -d '{ "uses": ["side"] }'

curl -X DELETE http://localhost:3000/api/connect/onboarding/sample \
  -H "Authorization: Bearer needt_REPLACE_ME"
```

This API is private and user-scoped. A token can access only its owner's data;
it is not an unauthenticated public integration platform.

## Public endpoints

These need no token. They are called from the landing page at `https://needt.app`
(CORS: that origin, plus `http://localhost:*` outside production; no
credentials).

### `POST /api/waitlist`

Body `{ "email": "...", "app": "mac" | "iphone", "source": "download" }`.

- `200 { "ok": true }` on success, and again for a repeat of the same
  `(email, app)`; a repeat adds no second row (table `AppWaitlist`).
- `400 { "error": "invalid_email" | "invalid_app" | "invalid_request" }`.
- `429` past 10 requests per minute per IP; `403` for a browser on another origin.
- Without `app` the old body (`{ email, ref?, source?, company? }`) still adds
  the address to the main waitlist, as before.

### `GET /api/lifetime-seats`

No token. Returns `{ "sold": number, "total": 300 }`. `sold` is the same count
the Lifetime cap uses (buyers plus open checkout holds), so the landing counter
and the checkout never disagree; `total` is the cap constant. Cached in memory
for 5 minutes and sent with `Cache-Control: public, max-age=300`. CORS:
`https://needt.app` (plus `http://localhost:*` outside production), `GET` and
`OPTIONS`, no credentials; a browser on another origin gets `403`.
