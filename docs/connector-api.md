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
