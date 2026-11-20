## ADDED Requirements

### Requirement: Tasks untouched for 14 days move to Someday
An open task that nobody touched for 14 days SHALL move to Someday. Touching means a person or agent changed its title, notes, dates, priority, status, project or plan membership; automatic rescheduling SHALL NOT count as a touch. Someday tasks SHALL NOT appear on the home screen or in a plan draft, and SHALL remain in search, projects, the API and MCP. (D3)

#### Scenario: Stale task moves
- **WHEN** an open task was last touched 15 days ago and the nightly sweep runs
- **THEN** the task is in Someday with the time it moved
- **AND** it no longer appears on the home screen or in drafts

#### Scenario: Protected tasks stay
- **WHEN** a stale task has a due date or deadline within the next 14 days, is recurring, is in an open day plan, or is a main task of the current plan
- **THEN** the sweep leaves it where it is

#### Scenario: Rescheduling is not a touch
- **WHEN** the scheduler only re-placed a task 3 days ago and a person last edited it 15 days ago
- **THEN** the task counts as untouched for 15 days

#### Scenario: Returning a task
- **WHEN** the person returns a Someday task
- **THEN** it is open again, counts as touched now, and may be added to a plan

### Requirement: Weekly one-tap Someday cleanup
Once a week the person SHALL be offered a Someday cleanup that resolves the whole batch in one tap, with per-task overrides. The offer SHALL ride on an existing touch and SHALL NOT be a third notification. (D3, D7)

#### Scenario: One tap
- **WHEN** the weekly cleanup shows 9 tasks that have been in Someday for at least 7 days and the person taps "Clear all"
- **THEN** those 9 tasks are archived (not hard-deleted) and can be restored from the archive

#### Scenario: Override before clearing
- **WHEN** the person marks 2 of the 9 as "keep" first
- **THEN** only 7 are archived

### Requirement: One-time launch migration with dry-run
A one-time migration SHALL move every open task untouched for more than 14 days to Someday, using the same protection rules as the sweep. It SHALL have a dry-run mode that changes nothing and reports how many tasks and how many users would move. Affected users SHALL see one screen with a "Return all" action that restores exactly the tasks the migration moved. (D10)

#### Scenario: Dry-run
- **WHEN** the migration runs in dry-run mode
- **THEN** it prints the number of tasks and users that would move, and the distribution per user
- **AND** it writes nothing to the database

#### Scenario: Real run is idempotent
- **WHEN** the migration runs twice
- **THEN** the second run moves nothing new and reports zero

#### Scenario: Return all
- **WHEN** an affected user taps "Return all" on the migration screen
- **THEN** every task moved by the migration for that user returns to its previous state
- **AND** tasks the user moved to Someday by hand are not touched
- **AND** the screen is not shown again

#### Scenario: Production guard
- **WHEN** a real run is started against production without a recorded database copy taken the same day
- **THEN** it refuses to run
