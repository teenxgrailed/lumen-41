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

| Scope         | Allows                                                       |
| ------------- | ------------------------------------------------------------ |
| `needt.read`  | Search, list and read tasks, projects, events, pages, habits |
| `needt.write` | Create and change them, run the scheduler                    |
| `mail.read`   | Mail in search, `needt_list`/`needt_get` with `type: mail`   |

A personal token carries all three and is not tied to a workspace. A call
that needs a scope the token lacks gets `403` with
`WWW-Authenticate: Bearer error="insufficient_scope", scope="…"` naming every
scope; search without `mail.read` simply leaves mail out.

The same token rules apply to the `/api/connect/*` routes below: reads need
`needt.read`, writes `needt.write`.

### Workspaces

Every tool takes an optional `workspaceId` argument (OAuth clients cannot
send headers). Header clients can also send `x-workspace-id: <id>`.
`needt_whoami` lists the person's workspaces. Without either, calls act in
the personal workspace — or, for an OAuth grant, in the workspace chosen at
consent; an OAuth grant cannot act in any other.

### Tools

Every tool carries `readOnlyHint` and `destructiveHint` annotations.

| Tool                  | Scope                                          | What it does                                                                                                        |
| --------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `needt_whoami`        | —                                              | The person, token kind, scopes, current workspace and all workspaces                                                |
| `needt_search`        | `needt.read` (+`mail.read` for mail)           | Text search across tasks, projects, events, pages, habits, mail                                                     |
| `needt_list`          | `needt.read` (+`mail.read` for mail)           | Paginated list by `type` (task, project, event, calendar, page, habit, mail, moodboard); `limit` ≤ 50, `cursor`     |
| `needt_get`           | `needt.read` (+`mail.read` for mail)           | One object in full by `type` and `id`                                                                               |
| `needt_create_task`   | `needt.write`                                  | `POST /api/connect/tasks`                                                                                           |
| `needt_schedule`      | `needt.write` (`needt.read` with `run: false`) | `POST` (or `GET` with `run: false`) `/api/connect/schedule`                                                         |
| `needt_reschedule`    | `needt.write`                                  | `POST /api/connect/reschedule`                                                                                      |
| `needt_control`       | `needt.write`                                  | `POST /api/connect/control`; every action the route accepts, deletes need `confirm: true`                           |
| `needt_update_task`   | `needt.write`                                  | Change title, description, dueDate, estimatedMinutes, priority, energy, status, projectId; other fields are refused |
| `needt_complete_task` | `needt.write`                                  | Mark a task done, or not done with `done: false`; repeating is a no-op                                              |
| `needt_create_event`  | `needt.write`                                  | Event in a Needt calendar (personal workspace only; provider calendars refused)                                     |
| `needt_create_page`   | `needt.write`                                  | Page with a Markdown or plain-text body, optionally under `parentId`                                                |
| `needt_append_page`   | `needt.write`                                  | Append Markdown or plain text to a page you can edit                                                                |
| `needt_log_habit`     | `needt.write`                                  | Mark a habit kept for a day (default today), or not with `kept: false`; future days refused                         |

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
