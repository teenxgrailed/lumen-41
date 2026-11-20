## ADDED Requirements

### Requirement: A day has one plan built from an evening note
Each person SHALL have at most one day plan per local date. The plan SHALL be built the evening before from the person's evening note plus their open tasks, as a draft that the person sees and can change before the day starts. On the morning of that date the phone home screen SHALL show only that plan, not the full task list. (D1)

#### Scenario: Evening note becomes tomorrow's draft
- **WHEN** the person saves an evening note "finish invoice, call Anna, gym" on 2026-11-19
- **THEN** a draft plan for 2026-11-20 exists within 60 seconds
- **AND** it contains a task for each item the note names, created through the same parsing used by quick add
- **AND** existing open tasks that match an item are reused instead of duplicated

#### Scenario: Draft without a note
- **WHEN** the evening touch fires and the person has written no note
- **THEN** a draft for tomorrow is still built from tomorrow's dated tasks, open main tasks and deadlines
- **AND** the draft is marked as built without a note

#### Scenario: Morning shows only the plan
- **WHEN** the person opens the app on a phone on a date that has a plan
- **THEN** the home screen lists the plan's tasks, main tasks first
- **AND** tasks that are not in the plan are not listed on the home screen
- **AND** the full list stays one tap away

#### Scenario: AI is unavailable
- **WHEN** AI is switched off, out of quota or fails while building the draft
- **THEN** the draft is built with the deterministic fallback parser and ranking
- **AND** the plan is marked as built without AI
- **AND** no evening note text is lost

#### Scenario: The person edits the draft
- **WHEN** the person removes, adds or reorders tasks in the draft before or during the day
- **THEN** the plan reflects the change immediately
- **AND** a later automatic rebuild for the same date never undoes a change the person made

### Requirement: The plan respects a person-chosen limit
The plan SHALL hold at most the person's task limit and at most their focus budget. The default limit SHALL be 5 tasks, 3 of them main. The person SHALL be able to set the limit from 3 to 10 tasks and the focus budget up to 5 hours; values outside these bounds SHALL be rejected. Main tasks SHALL be at most 3 and never more than the limit. (D2)

#### Scenario: Default limit
- **WHEN** a person who never changed the setting gets a draft from 12 candidate tasks
- **THEN** the plan holds 5 tasks
- **AND** exactly 3 of them are marked main when at least 3 candidates exist

#### Scenario: Focus budget caps a plan below the task limit
- **WHEN** the limit is 8 tasks and the focus budget is 5 hours, and the top candidates total 7 hours
- **THEN** the plan stops adding tasks before the total estimated duration passes 5 hours
- **AND** a task without an estimate counts as 30 minutes

#### Scenario: Out-of-range setting
- **WHEN** the person or an API client sets the limit to 2 or 11, or the focus budget to 6 hours
- **THEN** the request is rejected with a validation error naming the allowed range
- **AND** the stored setting is unchanged

#### Scenario: Adding past the limit
- **WHEN** the plan is full and the person adds one more task to it
- **THEN** the task is added only after the person confirms going over the limit, or swaps it for a task already in the plan
- **AND** the plan never grows past the limit without that explicit action

### Requirement: Adaptive limit suggestion after two weeks
After at least 14 local days with a closed or past plan, Needt SHALL suggest a limit based on how many planned tasks the person actually finished per day. The suggestion SHALL never change the setting by itself. (D2)

#### Scenario: Suggestion appears
- **WHEN** a person with limit 7 finished a median of 4 planned tasks per day over the last 14 plan days
- **THEN** Needt suggests a limit of 4 once
- **AND** accepting sets the limit to 4; dismissing leaves 7 and suppresses the suggestion for 14 days

#### Scenario: Not enough history
- **WHEN** the person has fewer than 14 plan days
- **THEN** no suggestion is made

#### Scenario: Suggestion stays in range
- **WHEN** the history median is 1 or 12
- **THEN** the suggested value is clamped to 3 or 10

### Requirement: The plan is reachable outside the app UI
Every plan action — read plan, edit plan, write the evening note, build the draft, close the day, read and change plan settings — SHALL be available through the authenticated HTTP API and the Needt MCP tools with the same validation as the app. (D5, D9; product rule: data reachable from outside)

#### Scenario: Agent reads tomorrow's plan
- **WHEN** an MCP client with read scope asks for the plan of a date
- **THEN** it receives the tasks with their main flag, order, limit, focus total and plan status

#### Scenario: Another user's plan
- **WHEN** a request names a plan or task that belongs to another user
- **THEN** it is answered as not found and nothing is changed

### Requirement: The plan is on for everyone with a kill switch
The day plan SHALL be enabled for every user without a rollout percentage. One server-side kill switch SHALL exist, on by default; turning it off SHALL return home to its previous content and stop plan touches without deleting any plan data. (D5)

#### Scenario: New and existing users
- **WHEN** the release is deployed
- **THEN** every user, new or existing, gets plan behavior with no per-user enrollment

#### Scenario: Kill switch off
- **WHEN** an operator turns the kill switch off
- **THEN** the home screen shows the previous home, no plan touches are sent, and plan rows remain stored
- **AND** turning it back on restores plans as they were

### Requirement: Desktop shows the same plan as a panel
On desktop `/today` SHALL show the same plan of the selected day as a panel next to the existing calendar and day document; there SHALL be no separate desktop plan logic. (D9)

#### Scenario: Same plan on both
- **WHEN** the person marks a plan task done on the phone
- **THEN** the desktop `/today` panel shows it done on its next load or live update
- **AND** the calendar and day document remain on `/today`
