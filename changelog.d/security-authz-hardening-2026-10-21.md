- Security hardening: a connector or OAuth token with read access only can no
  longer change data through the operations API (`/api/connect/ops`) or undo
  actions; writes there need the write scope, mail operations need the mail
  scope, and writes over `/api/connect` share the 30-a-minute limit that
  `/api/mcp` already had. Creating or editing a task accepts only the task's
  own fields, so a request can no longer attach reminders or other records to
  it, and a task can only wait on a task of its own workspace. A focus
  session can only be started on, book time to, or finish a task in the
  workspace you are in, and a viewer can run the timer but not touch a task
  through it. A viewer can no longer have the AI assistant create tasks,
  subtasks, mail follow-ups or page proposals.
