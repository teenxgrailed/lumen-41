- Tasks gain the fields the v3 task dialog needs, readable and writable through
  the task API, the connector ops and the MCP tools: labels (`tagIds` /
  `labelIds`), repeat (`recurrenceRule`, validated; the `isRecurring` flag now
  follows it on `PUT /api/tasks/:id`), hours (`scheduleId`), "No priority"
  (`priority: "none"` on the API, `NONE` in ops and MCP), `createdAt` in the
  task view, and files: `GET`/`POST /api/tasks/:id/attachments` and
  `GET`/`DELETE …/:attachmentId` (images and PDF, 4 MB, ten per task, bytes in
  Postgres, served `nosniff`), plus `task.attach` / `task.detach` ops and the
  `needt_attach_file` / `needt_remove_attachment` tools. Linking a label that
  is not yours is refused.
