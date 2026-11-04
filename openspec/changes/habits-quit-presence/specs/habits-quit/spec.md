## ADDED Requirements

### Requirement: QUIT habits are Pro and flagged

Creating a QUIT habit, turning a habit into one, changing its quit date or reason, and every events or summary call SHALL require the `habits_quit` flag and a Pro, Lifetime or trial plan, decided on the server. With the flag off the answer SHALL be 404; on Free with the flag on it SHALL be 403 `UPGRADE_REQUIRED`.

#### Scenario: Free creates a quit habit
- **WHEN** a Free account with the flag on posts a habit with `kind: "QUIT"`
- **THEN** the answer is 403 and nothing is stored

#### Scenario: Flag off
- **WHEN** a Pro account without the flag calls the events route
- **THEN** the answer is 404

### Requirement: Quit state is reported to clients

`GET /api/habits` SHALL include `quit`: `on` (flag on and plan allows), `upgrade` (flag on, plan Free) or `off` (flag off).

#### Scenario: Free with the flag
- **WHEN** a Free account with the flag on lists habits
- **THEN** `quit` is `upgrade`

### Requirement: Streak derived from the log

The current streak SHALL count whole calendar days in the person's time zone from `quitStartedAt` or the latest RELAPSE, whichever is later. Best streak, clean days and the next milestone from [1, 3, 7, 14, 30, 90, 365] SHALL be derived the same way. Days SHALL be calendar days, so daylight saving never shortens or lengthens one.

#### Scenario: Relapse restarts
- **WHEN** a relapse is logged on day 10 of a streak
- **THEN** the current streak is 0 and the best streak stays 10

### Requirement: Events

An event SHALL be one of URGE, RESISTED, RELAPSE, MILESTONE with a time (not in the future), an optional tag, intensity 1 to 5 and note. Tag, intensity and note SHALL be editable afterwards by the owner; type and time SHALL NOT. The urge pattern and top tags SHALL read URGE events only.

#### Scenario: Describe an urge later
- **WHEN** the owner patches an URGE event with a tag and intensity
- **THEN** the same event carries them and its type is unchanged

### Requirement: Quit habits are not scheduled

A QUIT habit SHALL NOT produce weekly task blocks.

#### Scenario: Schedule a quit habit
- **WHEN** the schedule route is called for a QUIT habit
- **THEN** the habit is treated as not found for scheduling

### Requirement: Agents can read and write the log

The MCP tools `needt_habit_event` and `needt_habit_quit_summary` SHALL be listed and callable only with the flag on, with the same Pro gate.

#### Scenario: Flag off
- **WHEN** the flag is off
- **THEN** `tools/list` omits both tools
