## ADDED Requirements

### Requirement: Habit reminders

Behind `habits_quit`, the worker SHALL send a push at a habit's `at` time in the person's time zone, an evening check-in at the person's chosen time (default 21:00), a push when a QUIT streak reaches a milestone (in the morning, around 09:00 local, and only for accounts on Pro; a trial counts as Pro), and, when switched on, one soft re-engage push after 3 days without a check-in. Texts SHALL be short and free of shame or pressure.

#### Scenario: Reminder in the person's zone
- **WHEN** a habit has `at` 18:00 and the person's zone is Europe/Zurich
- **THEN** the push is due at 18:00 Zurich time, also across a daylight-saving change

### Requirement: Quiet hours, switches and dedup

No push SHALL be sent in the person's quiet hours. Each kind SHALL be switchable globally in notification settings and per habit. At most one push of one kind per habit per day SHALL be sent. The re-engage push SHALL be off by default.

#### Scenario: Second run the same day
- **WHEN** the sweep runs twice in one day for the same habit and kind
- **THEN** one push is sent
