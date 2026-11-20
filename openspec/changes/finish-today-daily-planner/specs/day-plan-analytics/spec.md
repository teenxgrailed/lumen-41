## ADDED Requirements

### Requirement: Plan events carry no content
The four plan events SHALL be recorded once per occurrence and SHALL NOT contain task titles, note text or message text. (owner analytics list)

#### Scenario: No content in events
- **WHEN** any of `plan_built`, `day_closed`, `task_to_someday` or `channel_reply` is stored
- **THEN** it contains no task title, note text or message text

### Requirement: plan_built event
The system SHALL record `plan_built` when a date's plan is first built, with `date`, `taskCount`, `mainCount`, `limit`, `focusMinutes` and `source` (`note` | `no_note` | `fallback`). (D1, D2)

#### Scenario: Plan built
- **WHEN** the draft for tomorrow is built from a note with 5 tasks, 3 main, limit 5
- **THEN** one `plan_built` event is stored with `taskCount: 5`, `mainCount: 3`, `limit: 5`, `source: "note"`

#### Scenario: Rebuild does not double count
- **WHEN** the same date's draft is rebuilt after an edit
- **THEN** no second `plan_built` event is stored for that date

### Requirement: day_closed event
The system SHALL record `day_closed` when a day is closed, with `date`, `planned`, `done`, `toTomorrow`, `toSomeday`, `deleted` and `channel` (`app` | `telegram` | `api`). (D4)

#### Scenario: Day closed from Telegram
- **WHEN** the person resolves the last leftover from Telegram
- **THEN** one `day_closed` event is stored with `channel: "telegram"` and counts that add up to `planned`

### Requirement: task_to_someday event
The system SHALL record `task_to_someday` for each task moved to Someday, with `reason` (`stale` | `review` | `button` | `migration` | `manual`). (D3, D10)

#### Scenario: Sweep move
- **WHEN** the nightly sweep moves 3 tasks
- **THEN** three `task_to_someday` events with `reason: "stale"` are stored

### Requirement: channel_reply event
The system SHALL record `channel_reply` for each handled incoming channel message, with `channel` (`telegram`), `kind` (`text` | `voice` | `button`) and `tasksCreated`. (D8)

#### Scenario: Voice reply
- **WHEN** a voice reply creates 2 tasks
- **THEN** one `channel_reply` event is stored with `kind: "voice"` and `tasksCreated: 2`

### Requirement: Adaptive limit reads from recorded history
The adaptive limit suggestion SHALL be computed from stored `day_closed` events and plan records, so that it can be recomputed and audited from data. (D2)

#### Scenario: Recompute
- **WHEN** the suggestion is recomputed for a user from stored data
- **THEN** it gives the same value as the one shown to the person
