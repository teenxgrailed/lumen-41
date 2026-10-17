- Docs on the phone and the desktop card menu share one set of actions: Rename,
  Move to project, Pin or Unpin, Duplicate (a copy with the same text, cover,
  style and project), Share (the Share sheet, with the publish switch), Copy
  link and Move to Trash, each with Undo. On the phone they are the
  long-press sheet. Cards below the fold draw their page lazily and their cover
  pictures load lazily.
- Tasks can name the page they came from: `originPageId` on `GET`, `POST` and
  `PUT /api/tasks`, `GET` and `POST /api/connect/tasks`, and `originPageId` on
  `needt_list`, `needt_create_task` and `needt_update_task`. `GET /api/tasks`
  takes `?originPageId=<page id>` to list the tasks from one page. It is a
  shorthand for the existing `originKind: "doc"` and `originId` columns, so
  nothing in the schema changes.
