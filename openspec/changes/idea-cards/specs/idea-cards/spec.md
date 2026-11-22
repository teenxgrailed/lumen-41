## ADDED Requirements

### Requirement: An idea is a kind of task that is never late

Needt SHALL support a task kind `idea` next to `task` (default `task`). An idea SHALL have no due date, deadline, start date, schedule or reminder, SHALL NOT be recurring or a habit, SHALL NOT be completed, and SHALL NOT be overdue. An attempt to give an idea any of these through the app, the API or MCP SHALL be refused with a clear error and SHALL NOT silently drop the value.

#### Scenario: Idea created

- **WHEN** a person saves "Check AI agents news" as an idea
- **THEN** it is stored with kind `idea`, no due date and no schedule, and it never shows as overdue

#### Scenario: Date refused

- **WHEN** a client tries to set a due date on an idea
- **THEN** the call is refused and the idea is unchanged

### Requirement: A task and an idea convert in both directions

A person SHALL be able to turn a task into an idea and an idea into a task with one action each. Making a task an idea SHALL clear its due date, schedule, blocks and reminders in the same step and SHALL be undoable, restoring the old values. Making an idea a task through convert SHALL give a plain task with no placement.

#### Scenario: Overdue task becomes an idea

- **WHEN** a person converts the task "Read AI agents news", overdue since 21 Nov, to an idea
- **THEN** it has no due date, is no longer overdue, and Undo brings back the task with its old due date

### Requirement: Tasks that are really ideas are found

A task SHALL be a candidate when it is open, owned by the person, not Someday, not recurring, habit, synced or a sample, has no hard deadline, is not high priority, is not pinned, has no done subtask, its title has an optional-activity keyword (read, watch, news, tutorial, explore, look at and equivalents in the supported languages) and no commitment word (before, by, submit, send, pay and equivalents), and it either has no due date, is overdue, or has been moved to a later day. A task with a future due date SHALL NOT be a candidate. An optional AI check MAY reject a candidate and SHALL NOT create one.

#### Scenario: Optional reading overdue

- **WHEN** a task "Read AI agents news" is 3 days overdue
- **THEN** it is a candidate

#### Scenario: Real deadline

- **WHEN** a task is "Read contract before Friday"
- **THEN** it is not a candidate

#### Scenario: Future due date

- **WHEN** a task "Watch the breakdown" is due next week
- **THEN** it is not a candidate

### Requirement: Detected ideas are converted with undo

When idea cards are on, a periodic job SHALL convert candidates that are overdue 2 or more days or have been moved to a later day, at most 5 per person per run and 20 per day. Each conversion SHALL be recorded as an undoable action with the old values. The person SHALL see one summed line naming the tasks, with Undo that reverses all of them; a failed Undo SHALL say so. A task the job examined and did not convert, or whose conversion was undone, SHALL NOT be converted again until its title changes.

#### Scenario: Summed notice

- **WHEN** the job converts 3 tasks in one run
- **THEN** the person sees one line, not three, and Undo restores all three

#### Scenario: Undone stays undone

- **WHEN** the person undoes a conversion
- **THEN** the job does not convert that task again

#### Scenario: Fresh task

- **WHEN** a person has just written "Read news" with no date and it is not overdue or moved
- **THEN** the job leaves it a task

### Requirement: Idea cards are shown rarely and in rotation

Needt SHALL return at most 2 ideas per local day as idea cards, counting every idea shown that day including ones taken or skipped. Ideas SHALL be chosen least recently shown first, never-shown first, and an idea snoozed by Skip SHALL NOT be chosen until its snooze ends. The same day's cards SHALL be the same on every read and device. The response SHALL carry a position hint (after the 2nd visible task for the first card, after the 5th for the second, at the end when there are fewer tasks, never first). No card SHALL be returned when idea cards are off or the person has no ideas.

#### Scenario: Two a day

- **WHEN** a person has 10 ideas and opens Today three times in one day
- **THEN** the same 2 ideas are returned each time

#### Scenario: Skip does not open a slot

- **WHEN** a person skips one of the 2 cards of the day
- **THEN** no third idea is shown that day

#### Scenario: Rotation

- **WHEN** the next day starts
- **THEN** the 2 least recently shown ideas are chosen, not yesterday's

### Requirement: Skip pushes an idea back

Skip SHALL hide an idea for 7 days and count the skip. After the 3rd skip the idea SHALL be archived and no longer offered, and remain listed in the person's ideas through the API. Skip SHALL be undoable.

#### Scenario: Snoozed

- **WHEN** a person skips an idea
- **THEN** it is not offered again for 7 days

#### Scenario: Third skip

- **WHEN** an idea is skipped for the 3rd time
- **THEN** it is archived and not offered again

### Requirement: Take makes a task and places it now

Take SHALL turn an idea into a task, keep it open and auto-scheduled with its estimate or 30 minutes, and place it through the scheduler in the first free slot today from the current time; when today has no room it SHALL go to the first later day with room. Take SHALL NOT give the task a due date. The new task SHALL count against the day limit like any task and SHALL get an easy first step through easy start. Take SHALL be undoable and return the idea with its previous state.

#### Scenario: Room today

- **WHEN** a person takes "Check AI agents news" at 10:40 and today has free time
- **THEN** a task is placed at the first free slot after 10:40 today, with no due date

#### Scenario: No room today

- **WHEN** work hours are over for today
- **THEN** the task is placed on the first later day that has room

#### Scenario: Undo

- **WHEN** the person undoes Take
- **THEN** it is an idea again and the placement is gone

### Requirement: Ideas stay out of every count of real work

Ideas SHALL NOT appear in overdue lists or counts, SHALL NOT trigger overdue, digest, reminder or nudge notifications, SHALL NOT count toward the day plan limit, main tasks or an accepted plan, SHALL NOT count toward the easy start overload cap (6 per day) and SHALL NOT be changed by easy start, SHALL NOT reduce or use scheduler capacity, and SHALL NOT count toward a plan task cap or as completed. Task lists through the app, the API and MCP SHALL return only tasks unless the caller asks for ideas.

#### Scenario: Overdue count

- **WHEN** a person has 3 ideas and 1 overdue task
- **THEN** the overdue count is 1

#### Scenario: Day limit

- **WHEN** a day has 6 tasks and 5 ideas
- **THEN** the overload cap sees 6 tasks and moves nothing because of the ideas

#### Scenario: Default list

- **WHEN** an agent lists tasks without asking for ideas
- **THEN** no idea is returned

### Requirement: The person controls idea cards

Needt SHALL provide the setting "Idea cards", on by default for every account including existing ones, readable and writable through `GET` and `PATCH /api/user-settings` as `ideaCardsEnabled`. When off, no card SHALL be returned, no task SHALL be converted automatically and no `idea_shown` SHALL be recorded; stored ideas SHALL stay and remain usable through the API. The server flag `idea_cards` SHALL be on for everyone and SHALL stop cards and the conversion job when turned off, without a deploy. A settings read that fails SHALL be treated as off.

#### Scenario: Off

- **WHEN** the person turns idea cards off
- **THEN** Today shows no idea, nothing is converted, and their ideas can still be listed through the API

#### Scenario: Flag off

- **WHEN** the flag is turned off
- **THEN** no card is returned and the job converts nothing

### Requirement: Ideas are reachable from outside

Ideas SHALL be created, listed, updated, taken, skipped, converted and undone through the app API, the connector API and MCP, each also reporting `kind` on tasks. Every automatic and manual change SHALL be recorded as an agent action readable through `GET /api/agent/actions` and undoable through `POST /api/agent/actions/:id/undo`.

#### Scenario: Agent creates an idea

- **WHEN** an MCP client creates an idea "Watch the Figma config talk"
- **THEN** it is stored as an idea with source `agent` and appears in the idea list

### Requirement: Idea use is measured without content

Needt SHALL record `idea_shown`, `idea_taken` and `idea_skipped` events with short kinds and counts only (source, position, skip count, whether it was placed today) and SHALL NOT record an idea's title or text.

#### Scenario: Taken

- **WHEN** a person takes an idea
- **THEN** one `idea_taken` event is recorded with its source and skip count and no title
