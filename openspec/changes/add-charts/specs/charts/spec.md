## ADDED Requirements

### Requirement: Chart blocks on a project or on Home

A person SHALL be able to add a chart block to a project or to Home that shows
task progress over time, habit check-ins with streaks, or time spent, as a
line or bars over 7, 14, 30 or 90 days.

#### Scenario: Progress on a project

- **WHEN** a person adds a progress chart to a project with 10 tasks, 6 done
- **THEN** the chart shows "6 of 10 done" and one point per day with the
  running done and total counts of that project's tasks only

#### Scenario: Home counts the workspace

- **WHEN** a chart is added without a project
- **THEN** it appears in Home's Charts tile and counts the whole workspace

### Requirement: Series derived on read

A chart SHALL store only what to measure; its numbers SHALL be computed on
every read from tasks, habit completions and finished time entries, in the
person's time zone, with a scale starting at zero.

#### Scenario: A streak longer than the range

- **WHEN** a habit was kept every day for 40 days and the chart shows 7
- **THEN** the current streak reads 40

### Requirement: Reachable from outside

Charts SHALL be readable and writable through `/api/charts`,
`/api/connect/ops/chart.*` and the MCP tools `needt_create_chart`,
`needt_update_chart`, `needt_get` and `needt_list`, and every write SHALL
answer with an `actionId` that undo can reverse.

#### Scenario: An agent adds a chart

- **WHEN** an MCP client calls `needt_create_chart` with `metric:
"habit_streak"` and a `habitId`
- **THEN** the answer carries the chart with its series and an `actionId`,
  and the chart shows on Home
