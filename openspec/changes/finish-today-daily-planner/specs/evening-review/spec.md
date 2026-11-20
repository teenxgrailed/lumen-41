## ADDED Requirements

### Requirement: Every unfinished planned task is resolved explicitly
Closing a day SHALL present every unfinished task of that day's plan, and each one SHALL be resolved with exactly one of: tomorrow, later (Someday), or delete. The day SHALL count as closed only when every unfinished planned task has a resolution. (D4)

#### Scenario: Three choices per leftover
- **WHEN** the person closes a day with 2 unfinished planned tasks
- **THEN** each task offers tomorrow, later and delete
- **AND** "tomorrow" adds it to the next day's draft, "later" moves it to Someday, "delete" deletes the task
- **AND** the day is recorded as closed with the count of done, moved, someday and deleted tasks

#### Scenario: Delete is recoverable
- **WHEN** the person chooses delete on a leftover
- **THEN** the task is removed from all plans and lists
- **AND** an undo is available for at least 10 seconds in the same session

#### Scenario: Nothing left
- **WHEN** every planned task is done
- **THEN** closing the day needs one confirmation and records the day as closed

#### Scenario: Leftovers in tomorrow count against the limit
- **WHEN** resolving leftovers as "tomorrow" would push tomorrow past the limit
- **THEN** the person is told which tasks would not fit before confirming
- **AND** no task is dropped from tomorrow without the person's choice

### Requirement: Nothing carries over silently
An unfinished planned task SHALL NOT move to another day without the person's explicit resolution. Automatic rescheduling SHALL NOT move a task out of a day plan that has not been closed. (D4)

#### Scenario: Day never closed
- **WHEN** the person never closes 2026-11-19 and opens the app on 2026-11-20
- **THEN** the unfinished planned tasks of 2026-11-19 are shown as "needs a decision", separate from today's plan and outside its limit
- **AND** they are not added to the 2026-11-20 plan until the person resolves them

#### Scenario: Scheduler on a missed task
- **WHEN** a planned auto-scheduled task's time passes unfinished and reschedule-on-miss is on
- **THEN** the task may get a new time within the same day
- **AND** it is not moved to a later date while its day plan is open

#### Scenario: test_leftover_task_is_not_moved_silently
- **WHEN** midnight passes with an unfinished planned task and no review
- **THEN** the task's plan date, due date and Someday state are unchanged
