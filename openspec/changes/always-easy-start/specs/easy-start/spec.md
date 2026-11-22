## ADDED Requirements

### Requirement: A new task gets an easy first step

When a task is created without an entry step, Needt SHALL give it an entry step of 15 minutes or less and up to 3 subtasks. A task that already has an entry SHALL NOT be changed.

#### Scenario: Created without an entry

- **WHEN** a person creates the task "Prepare tax return" with no entry
- **THEN** the task gets an entry step and no more than 3 subtasks, and the change is recorded so it can be undone

#### Scenario: Created with an entry

- **WHEN** a task is created with its own entry
- **THEN** nothing is added to it

#### Scenario: Not the person's own work

- **WHEN** the task is a habit occurrence, a recurring instance, an onboarding example or a task synced from an external provider
- **THEN** nothing is added to it

### Requirement: A stuck task is made smaller

An open task that was moved to another day once or more, or that was not started 2 days after it was due to start, SHALL be split again: a new smaller entry step and a simpler title (the title rewrite is allowed and undoable). After a rewrite the task SHALL NOT be rewritten again for 7 days.

#### Scenario: Moved once

- **WHEN** the scheduler has moved a task to a different day and it is still open
- **THEN** the next sweep gives it a smaller entry and a simpler title, and records a before and after for undo

#### Scenario: Not started

- **WHEN** a task's start day is 3 or more days in the past and no subtask is done
- **THEN** the next sweep rewrites it the same way

#### Scenario: Same day is not a move

- **WHEN** the scheduler moves a task to another time on the same day
- **THEN** the move does not count

#### Scenario: Cooling down

- **WHEN** a task was rewritten, or the rewrite was undone, less than 7 days ago
- **THEN** it is not rewritten again

### Requirement: An overloaded day is eased

When more than 6 open tasks sit on one day, the overflow SHALL move to the following days through the existing task spread. Only auto-scheduled tasks move: pinned, hand-placed, locked, frozen and hard-deadline tasks SHALL stay where they are. A task that fits on no later day stays where it is.

#### Scenario: Eight tasks on one day

- **WHEN** a day holds 8 open auto-scheduled tasks
- **THEN** 2 of them, the lowest priority first, move to later days and the day keeps 6

#### Scenario: Undone

- **WHEN** the person undoes an automatic move
- **THEN** no automatic move is made for that person for 24 hours

### Requirement: The person can turn it off

Needt SHALL provide the setting "Always easy start", on by default for every account, existing accounts included. The setting SHALL be readable and writable through `GET` and `PATCH /api/user-settings`. With it off, none of the three rules SHALL change any of the person's tasks.

#### Scenario: Setting off

- **WHEN** the person turns the setting off
- **THEN** a new task is left as created, and the sweep touches none of their tasks

#### Scenario: Existing account

- **WHEN** the migration has run
- **THEN** every existing account has the setting on

### Requirement: Server kill switch

The feature flag `always_easy_start` SHALL be on for everyone and SHALL stop all three rules when turned off, without a deploy.

#### Scenario: Flag off

- **WHEN** the flag is off
- **THEN** no task is rewritten or moved by this feature

### Requirement: Every automatic change can be undone

Each automatic change SHALL be recorded with its before and after state as an agent action that can be undone through `POST /api/agent/actions/:id/undo` and listed through `GET /api/agent/actions`. Undo SHALL refuse, and change nothing, when the person edited the task after the change. The open app SHALL show one line "Simplified: ..." with Undo.

#### Scenario: Undo a rewrite

- **WHEN** the person presses Undo on the line
- **THEN** the old title and entry are back and the subtasks that were added are removed

#### Scenario: Edited since

- **WHEN** the person changed the task after the rewrite and then asks to undo
- **THEN** the undo answers 409 and the task is left as it is

### Requirement: AI use is metered

Free accounts SHALL NOT get an AI breakdown here: they always get the fallback entry, and nothing is claimed, so it never counts against their 20 monthly actions. Pro, Lifetime and trial accounts get the AI breakdown, and each generation SHALL count as one action against the plan through the hosted AI claim. When the allowance is spent or no AI is available, Needt SHALL use the fallback entry "Open it and do the first 10 minutes." without subtasks and without an error.

#### Scenario: Free plan

- **WHEN** a Free account creates a task
- **THEN** the task gets the fallback entry, no AI is called and no action is claimed
