## ADDED Requirements

### Requirement: A new task gets an easy first step

When a task is created without an entry step, Needt SHALL give it an entry step of 15 minutes or less and up to 3 subtasks. A task that already has an entry SHALL NOT be changed. If the person (or another job) set an entry while the step was being prepared, the prepared step SHALL be dropped and nothing SHALL be written.

#### Scenario: Created without an entry

- **WHEN** a person creates the task "Prepare tax return" with no entry
- **THEN** the task gets an entry step and no more than 3 subtasks, and the change is recorded so it can be undone

#### Scenario: Created with an entry

- **WHEN** a task is created with its own entry
- **THEN** nothing is added to it

#### Scenario: Typed meanwhile

- **WHEN** the person types an entry on the task after the step was requested and before it was written
- **THEN** the person's entry stays, nothing is added, and any hosted AI action claimed for it is given back

#### Scenario: Not the person's own work

- **WHEN** the task is a habit occurrence, a recurring instance, an onboarding example or a task synced from an external provider
- **THEN** nothing is added to it

### Requirement: A stuck task is made smaller

An open task that was given a LATER day once or more, or that was not started 2 days after it was due to start, SHALL be split again: a new smaller entry step and a simpler title (the title rewrite is allowed and undoable). After a rewrite the task SHALL NOT be rewritten again for 7 days. These thresholds are fixed in the server; there is no setting for them.

Any move to a later calendar day SHALL count, whoever made it: the person (by hand, in the app, through the API or a connector), an agent, or the scheduler. A move to an earlier day, a new time on the same day, and the first placement of a task that had no day SHALL NOT count. The "moved from" badge's `previousScheduledStart` SHALL NOT be written by this feature.

#### Scenario: Moved once

- **WHEN** a task is given a later day (by the person or the scheduler) and it is still open
- **THEN** the next sweep gives it a smaller entry and a simpler title, and records a before and after for undo

#### Scenario: Not started

- **WHEN** a task's start day is 3 or more days in the past and no subtask is done
- **THEN** the next sweep rewrites it the same way

#### Scenario: Same day or earlier day is not a move

- **WHEN** a task gets another time on the same day, or an earlier day
- **THEN** the move does not count

#### Scenario: Cooling down

- **WHEN** a task was rewritten, or the rewrite was undone, less than 7 days ago
- **THEN** it is not rewritten again

#### Scenario: Looked at, not changed

- **WHEN** the sweep examines a task and does not rewrite it (the person touched it, it is in an archived or excluded project, it is already on the fixed entry)
- **THEN** it is stamped as looked at and leaves the candidate set, so later runs reach tasks behind it

### Requirement: An overloaded day is eased

When more than 6 open tasks sit on one day in one workspace, the overflow SHALL move to the following days through the existing task spread. Only auto-scheduled tasks move: pinned, hand-placed, locked, frozen and hard-deadline tasks, habits, series and synced tasks, and tasks in an excluded project SHALL stay where they are. A task that fits on no later day stays where it is. A moved task SHALL be held on its new day (the scheduler's not-before date) and SHALL NOT be given a due date it did not have, so the next scheduler run does not pull it back. A move made by this rule SHALL NOT count as a postponement. Each workspace the person can edit is balanced on its own, never summed across workspaces.

#### Scenario: Eight tasks on one day

- **WHEN** a day holds 8 open auto-scheduled tasks
- **THEN** 2 of them, the lowest priority first, move to later days and the day keeps 6

#### Scenario: Held, not pulled back

- **WHEN** the scheduler runs after a task was moved to a later day by this rule
- **THEN** the task stays on that day and its reschedule count is unchanged

#### Scenario: Two workspaces

- **WHEN** a person has 4 tasks on a day in one workspace and 4 in another
- **THEN** nothing moves

#### Scenario: Undone

- **WHEN** the person undoes an automatic move
- **THEN** the not-before date is cleared with the dates, and no automatic move is made for that person for 24 hours

### Requirement: Existing tasks get a first step once

Needt SHALL give every existing open task that has no entry an entry step once, through a background job that works in small batches per person (25 per run) and is rate-limited. The same rules as a new task apply: Free accounts without their own key get the fallback entry and nothing is claimed; Free accounts with their own key and Pro, Lifetime and trial accounts get the AI step. A task that was looked at SHALL NOT be tried again. Each change is a `task.simplify` action that can be undone from the history; the person sees one summed line, not one per task. The backfill runs only for people in "auto" mode.

#### Scenario: A person with 60 open tasks and no entries

- **WHEN** the backfill runs
- **THEN** at most 25 of them get an entry per run, and the rest follow in later runs

#### Scenario: Suggest or off

- **WHEN** the person's mode is "suggest" or "off"
- **THEN** the backfill does not touch their tasks

### Requirement: The person controls it

Needt SHALL provide the setting "Always easy start" with three modes, "auto" (default for every account, existing accounts included), "suggest" and "off", and the setting "Keep out of easy start", a list of projects. Both SHALL be readable and writable through `GET` and `PATCH /api/user-settings` as `easyStartMode` and `easyStartExcludedProjectIds`. No rule SHALL change a task in an excluded project.

- "auto": the rules change tasks and each change can be undone.
- "suggest": no task is changed. Needt stores a proposal and shows one line "Simplify? ..." with Apply. Apply runs the same change as "auto", so it can be undone. A proposal made from a title or entry the person has since changed is marked stale and not applied. Overload spreading and the backfill do nothing in this mode.
- "off": none of the rules change any task.

Proposals SHALL be readable through `GET /api/easy-start/proposals` and applied or dismissed through `POST /api/easy-start/proposals/:id` with `{ "action": "apply" | "dismiss" }`.

The settings use only the existing settings rows (a select row and a project pick row). The look of a task row SHALL NOT change. API task views SHALL return `entry` next to `title`.

#### Scenario: Mode off

- **WHEN** the person turns the mode off
- **THEN** a new task is left as created, and the sweep touches none of their tasks

#### Scenario: Suggest mode

- **WHEN** a task with no entry is created and the mode is "suggest"
- **THEN** the task is unchanged, a pending proposal exists, and the open app shows "Simplify?" with Apply

#### Scenario: Apply, then undo

- **WHEN** the person presses Apply and later Undo
- **THEN** the entry and subtasks are added, then removed, through the same recorded action

#### Scenario: Excluded project

- **WHEN** a task is in a project the person excluded
- **THEN** none of the rules touches it

#### Scenario: Existing account

- **WHEN** the migration has run
- **THEN** every existing account is in "auto" with no excluded project

### Requirement: Server kill switch

The feature flag `always_easy_start` SHALL be on for everyone and SHALL stop all rules when turned off, without a deploy. A settings read that fails SHALL be treated as "off".

#### Scenario: Flag off

- **WHEN** the flag is off
- **THEN** no task is rewritten, proposed, backfilled or moved by this feature

### Requirement: Every automatic change can be undone

Each automatic change SHALL be recorded with its before and after state as an agent action that can be undone through `POST /api/agent/actions/:id/undo` and listed through `GET /api/agent/actions`. Undo SHALL refuse, and change nothing, when the person edited the task, or ticked, renamed or deleted a subtask the change added, after the change. Undo of a rewrite SHALL also put back the reschedule count and the looked-at stamp. The open app SHALL show one line "Simplified: ..." with Undo; a failed Undo SHALL say so.

#### Scenario: Undo a rewrite

- **WHEN** the person presses Undo on the line
- **THEN** the old title and entry are back and the subtasks that were added are removed

#### Scenario: Edited since

- **WHEN** the person changed the task, or ticked an added subtask, after the rewrite and then asks to undo
- **THEN** the undo answers 409 and the task is left as it is

### Requirement: AI use is metered

Free accounts without their own AI key SHALL NOT get an AI breakdown here: they always get the fallback entry, and nothing is claimed, so it never counts against their 20 monthly actions. Free accounts with their own key (BYOK) get the AI breakdown on that key. Pro, Lifetime and trial accounts get the AI breakdown, and each generation SHALL count as one action against the plan through the hosted AI claim. When the allowance is spent or no AI is available, Needt SHALL use the fallback entry "Open it and do the first 10 minutes." without subtasks and without an error. A hosted action claimed for an answer that ends as the fallback, or for a write that failed, SHALL be given back.

#### Scenario: Free plan

- **WHEN** a Free account without its own key creates a task
- **THEN** the task gets the fallback entry, no AI is called and no action is claimed

#### Scenario: Free plan with its own key

- **WHEN** a Free account with its own key creates a task
- **THEN** the AI step is used on that key, and nothing is claimed from the hosted allowance

#### Scenario: A fallback costs nothing

- **WHEN** the AI answer cannot be read, or the write is refused
- **THEN** the claimed hosted action is released
