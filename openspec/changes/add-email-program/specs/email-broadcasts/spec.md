## ADDED Requirements

### Requirement: Compose a broadcast

An admin SHALL be able to write a broadcast with a subject, a preheader, plain paragraphs and at most one button, in the category `updates` or `offers`.

#### Scenario: Draft
- **WHEN** an admin saves a draft
- **THEN** it is stored with status `draft`, nothing is sent, and a preview renders it in the one layout with its plain-text part

#### Scenario: Claude drafts
- **WHEN** Claude creates a draft through the admin API
- **THEN** the draft is stored with `createdBy` naming the actor

#### Scenario: Validation
- **WHEN** the subject is empty, longer than 100 characters, or the button URL is not `https`
- **THEN** the save is refused with the reason

### Requirement: Segments

A broadcast SHALL target one segment: `free`, `pro`, `trial`, `students` or `all`.

#### Scenario: Count before send
- **WHEN** an admin picks a segment
- **THEN** the page shows the number of people who would receive it now, after exclusions

#### Scenario: Students
- **WHEN** the segment is `students`
- **THEN** it contains verified accounts whose address domain matches the student-domain list in code, and nobody is flagged in storage

#### Scenario: Trial segment
- **WHEN** the segment is `trial`
- **THEN** it contains people with an active trial who have no paid plan and no active gift

#### Scenario: All
- **WHEN** the segment is `all`
- **THEN** sending requires the admin to type the recipient count shown

### Requirement: Exclusions

The system SHALL exclude from every broadcast anyone with the category off, who unsubscribed from all optional mail, whose address is suppressed, who is a sandbox or unverified or deleted account, or who has `emailNotifications` off.

#### Scenario: Opted out
- **WHEN** a person in the segment has `updates` off
- **THEN** they do not receive the broadcast and the count excludes them

#### Scenario: Cap
- **WHEN** a person in the segment got a marketing mail inside the cap window
- **THEN** their send is deferred to the next allowed window, for up to 7 days, and dropped after that with reason `cap-expired`

### Requirement: Test send

A test SHALL go to the owner's address before a broadcast can be scheduled. Claude may schedule broadcasts itself, without an owner click, but only through these safeguards.

#### Scenario: Test send
- **WHEN** an admin presses "Send test to me"
- **THEN** one mail goes to the signed-in admin's address only, with `[TEST]` in the subject, and the broadcast status becomes `testing`

#### Scenario: No test, no send
- **WHEN** a broadcast has never been test-sent, or was edited after its last test
- **THEN** scheduling is refused

#### Scenario: Test link is harmless
- **WHEN** the unsubscribe link in a test mail is used
- **THEN** it changes nothing for any real account

### Requirement: Schedule and send

An admin SHALL be able to schedule or send a broadcast, and the worker SHALL send it in paced batches.

#### Scenario: Schedule
- **WHEN** an admin or Claude schedules for a time at least 15 minutes ahead and within 30 days
- **THEN** status becomes `scheduled`, a log row records actor, segment and recipient count, and the broadcast can be cancelled until it starts

#### Scenario: Cancel window
- **WHEN** the requested time is less than 15 minutes ahead
- **THEN** scheduling is refused with the reason

#### Scenario: Send now
- **WHEN** a scheduled time arrives
- **THEN** status becomes `sending` and the worker sends in batches of up to 100 at no more than 5 requests per second

#### Scenario: One broadcast per 7 days
- **WHEN** a person received a broadcast in the last 7 days
- **THEN** they are skipped with reason `broadcast-cap`

#### Scenario: Exactly once
- **WHEN** the worker restarts mid-send
- **THEN** it resumes from the ledger and no person gets the broadcast twice

#### Scenario: Result
- **WHEN** sending finishes
- **THEN** status becomes `sent` and the page shows sent, skipped by reason, bounced and complained counts

#### Scenario: Not an admin
- **WHEN** a non-admin calls any broadcast route
- **THEN** the response is 403 through `requireAdmin`

#### Scenario: Stop
- **WHEN** an admin or Claude cancels a `sending` broadcast
- **THEN** no further batches are sent and the count already sent is kept
