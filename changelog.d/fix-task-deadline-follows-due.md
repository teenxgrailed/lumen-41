- Fix: moving a task's due date through Ask or the Needt connector now moves its
  deadline with it when the two were the same date, so the scheduler stops
  placing the task by the old one. `needt_update_task` and `task.update` also
  accept `deadline` to set it on its own.
