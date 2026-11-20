## ADDED Requirements

### Requirement: Two touches a day at the person's times
The day plan system SHALL send at most two notifications per person per local day: a morning plan and an evening "close the day". Their local times SHALL be set by the person, defaulting to 08:00 and 21:00 in the person's time zone. Each SHALL be sent once per day at most. (D7)

#### Scenario: Defaults
- **WHEN** a person in Europe/Zurich has not set times
- **THEN** the morning plan arrives between 08:00 and 08:05 local time and the evening touch between 21:00 and 21:05

#### Scenario: Custom times
- **WHEN** the person sets 06:30 and 22:15
- **THEN** the next touches use those local times

#### Scenario: Exactly once
- **WHEN** the worker restarts or the sweep runs twice inside the window
- **THEN** the person still receives each touch at most once that day

#### Scenario: Unknown time zone
- **WHEN** the person has no stored time zone
- **THEN** no touch is sent and no time zone is guessed

### Requirement: Touch content
The morning touch SHALL carry the plan's main tasks and the count of the rest, and open the plan. The evening touch SHALL carry the count of unfinished planned tasks and open the evening review and note. (D1, D4)

#### Scenario: Morning content
- **WHEN** the plan has main tasks "Invoice", "Call Anna", "Gym" and 2 more
- **THEN** the morning touch names the three and says "+2"

#### Scenario: Empty plan
- **WHEN** there is no plan and no candidate task for the day
- **THEN** the morning touch is skipped for that day

### Requirement: Nothing else is sent by the plan system
The plan system SHALL NOT send any notification other than the two touches; the weekly cleanup and limit suggestion SHALL appear inside a touch or in the app. The person SHALL be able to turn either touch off. Touches SHALL go to every enabled channel of the person (web push, native push, linked messenger) as one logical touch. (D7, D6)

#### Scenario: Touch off
- **WHEN** the person turns the evening touch off
- **THEN** no evening touch is sent on any channel

#### Scenario: Several channels
- **WHEN** the person has web push and Telegram linked
- **THEN** both receive the morning touch, and it counts as one touch for the day
