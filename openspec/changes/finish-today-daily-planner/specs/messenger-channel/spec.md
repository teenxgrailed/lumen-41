## ADDED Requirements

### Requirement: One plan brain, channels as adapters
Plan conversations SHALL be handled by one channel-independent core: it produces outgoing messages (plan, evening review) with actions, and accepts incoming events (text, voice transcript, action press) from any channel. A channel adapter SHALL only translate between the core and its messenger. Adding a channel SHALL NOT change plan behavior. Telegram SHALL be the first adapter; WhatsApp is out of scope. (D6)

#### Scenario: Same result from two channels
- **WHEN** the same reply text arrives through the Telegram adapter and through a test adapter
- **THEN** the core creates the same tasks for tomorrow

#### Scenario: test_core_does_not_know_the_messenger
- **WHEN** the core handles an incoming text event
- **THEN** its input and output carry no messenger-specific fields

### Requirement: Account linking
A person SHALL link a messenger account from inside Needt with a single-use code that expires after 10 minutes. One messenger account SHALL link to at most one Needt user. The person SHALL be able to unlink from Needt or from the messenger. Messages from unlinked accounts SHALL be answered only with linking instructions. (D6, D8)

#### Scenario: Link
- **WHEN** the person opens the link from Needt settings and presses Start in Telegram within 10 minutes
- **THEN** the Telegram chat is linked to that user and the bot confirms

#### Scenario: Expired or reused code
- **WHEN** a code older than 10 minutes, or already used, is presented
- **THEN** linking fails and nothing is linked

#### Scenario: Unlinked sender
- **WHEN** an unlinked Telegram account sends "buy milk"
- **THEN** no task is created anywhere and the bot replies with how to link

#### Scenario: Unlink
- **WHEN** the person unlinks
- **THEN** no further touches go to that chat and incoming messages from it are treated as unlinked

### Requirement: Bot sends the plan and the evening review
A linked channel SHALL receive the morning plan and the evening review as the person's daily touches. Each planned task in a message SHALL have "done" and "later" actions. (D7, D8)

#### Scenario: Done button
- **WHEN** the person presses "done" on "Call Anna" in the morning message
- **THEN** the task is completed in Needt and the message updates to show it done

#### Scenario: Later button
- **WHEN** the person presses "later" on a task
- **THEN** the task moves to Someday and leaves the plan

#### Scenario: Stale button
- **WHEN** a button is pressed for a task that was deleted or belongs to a past closed day
- **THEN** nothing changes and the bot says the task is no longer in the plan

### Requirement: Text or voice reply becomes tasks for tomorrow
A text or voice reply in a linked chat SHALL be parsed into tasks for tomorrow's draft, using the same parsing as quick add. Voice SHALL be transcribed first; the bot SHALL echo the created task titles. (D8)

#### Scenario: Voice reply
- **WHEN** the person replies to the evening review with a voice note saying "tomorrow call the landlord and send the invoice"
- **THEN** two tasks "Call the landlord" and "Send the invoice" are added to tomorrow's draft
- **AND** the bot replies with both titles
- **AND** the tasks are visible in Needt

#### Scenario: Transcription fails
- **WHEN** the voice note cannot be transcribed
- **THEN** no task is created and the bot asks for text instead

#### Scenario: Duplicate delivery
- **WHEN** the messenger delivers the same update twice
- **THEN** tasks are created once

### Requirement: Channel security
Incoming channel requests SHALL be authenticated with the channel's own secret before any processing, and SHALL be rate-limited per linked user. Message content SHALL NOT be logged beyond what is needed to debug a failure. (D6)

#### Scenario: Forged webhook
- **WHEN** a request reaches the Telegram webhook without the configured secret
- **THEN** it is rejected and nothing is processed

#### Scenario: Flood
- **WHEN** a linked chat sends more messages than the per-user limit in a minute
- **THEN** extra messages are not parsed and the bot says to slow down once
