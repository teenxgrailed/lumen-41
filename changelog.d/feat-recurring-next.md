- Recurring tasks now work end to end. Completing one (in the app, through
  `PUT /api/tasks/:id`, the `task.complete` op or `needt_complete_task`) records
  that occurrence as a finished task and moves the same task to its next date,
  keeping its time of day. The series is anchored on the task's own date, so
  "every week" no longer follows the weekday you happen to tick it on, "every
  day" no longer skips a day, and ticking an overdue task lands it on a coming
  date. The Repeat chip gains Custom: every N days, weeks or months, on chosen
  weekdays. `task.complete` no longer refuses recurring tasks, and Undo puts the
  date back and removes the recorded occurrence.
