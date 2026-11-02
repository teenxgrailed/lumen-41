## ADDED Requirements

### Requirement: Agents screen

When the flag is on, the app SHALL offer an Agents screen at `/agents` with four sections: Agents (name, kind, capabilities, last seen, token management), Needs you (items in `needs_owner` with the question), Work (open, claimed, in progress, blocked, done, failed items, each with its latest update; finished items older than 14 days are hidden behind a "Show older" control), and Notes (list with tag filter and edit). The screen SHALL use existing components and the four design rules and SHALL work at phone width. With the flag off the route SHALL answer 404 and no navigation entry SHALL show.

#### Scenario: Items by state
- **WHEN** the owner opens the screen with one open, one claimed and one done item
- **THEN** each appears under its state with the latest update text and time

#### Scenario: Flag off
- **WHEN** an account without the flag opens `/agents`
- **THEN** the page is not found

### Requirement: Item detail and log

Opening an item SHALL show its brief, assignee or required skills, lease end, links, result and the full event log with actor and time. A `done` item with criteria not met SHALL be marked.

#### Scenario: Read the log
- **WHEN** the owner expands an item
- **THEN** every event is listed oldest first with agent name and time

### Requirement: Owner actions

The screen SHALL let the owner answer a `needs_owner` item with text, approve declared risks one by one, cancel an item, reassign an unclaimed item, create an item, and edit any note. Approve SHALL be disabled for items with no declared risks.

#### Scenario: Answer
- **WHEN** the owner types an answer and submits
- **THEN** the item returns to `open` for the same agent and the answer appears in the log

#### Scenario: Approve one risk
- **WHEN** an item declares `publish` and `send_message` and the owner approves only `publish`
- **THEN** completion remains blocked until `send_message` is approved too

### Requirement: Honest empty and warning states

With no agents the screen SHALL explain how to connect one. An "any capable" item matched by no registered agent SHALL be marked "no capable agent". An agent row on the shared personal token SHALL show a note that several agents may be sharing it.

#### Scenario: No agent can do it
- **WHEN** an open item requires `screen-recording` and no agent has that skill
- **THEN** the item shows "no capable agent"
