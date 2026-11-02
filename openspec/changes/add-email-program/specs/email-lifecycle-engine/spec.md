## ADDED Requirements

### Requirement: Rule-based engine on the worker

The system SHALL run lifecycle email as rules evaluated by a BullMQ worker on a queue `email-lifecycle`, each rule having a key, a category, a trigger, a skip condition, a priority and a template, and SHALL record every decision in a ledger.

#### Scenario: Sweep
- **WHEN** the repeatable sweep runs
- **THEN** it selects candidates per rule with a bounded query, evaluates each with a pure decision function, and writes one ledger row per decision: `sent`, `skipped` with a reason, or `deferred` with a time

#### Scenario: Exactly once
- **WHEN** two workers evaluate the same person and rule at once
- **THEN** a unique key on user, rule and dedupe key lets only one claim succeed, and the other records nothing

#### Scenario: Crash after claim
- **WHEN** a claim has no result after 15 minutes
- **THEN** it is treated as stale and retried, at most 3 times with 1 hour between tries, then marked `failed`

#### Scenario: Flag off
- **WHEN** the flag `email-lifecycle` is off for a person
- **THEN** the engine records nothing for them and sends nothing

#### Scenario: Dry run
- **WHEN** the engine runs in dry-run mode
- **THEN** ledger rows have status `dry` with the reason that would apply, and Resend is never called

### Requirement: Welcome and onboarding

The system SHALL send a welcome mail when the email is confirmed, and onboarding mails about 2, 5 and 9 days later, each teaching one step and each skipped when the person already did that step.

#### Scenario: Welcome
- **WHEN** a person confirms their email
- **THEN** one welcome mail is sent as `transactional`, once per account, and it contains no price and no upsell

#### Scenario: Step already done
- **WHEN** the day-2 rule fires for a person who has already connected a calendar or created a task
- **THEN** no mail is sent and the ledger records `step-done`

#### Scenario: Active person gets nothing
- **WHEN** a person completed all three steps before day 2
- **THEN** they receive no onboarding mail at all

#### Scenario: Paid already
- **WHEN** the day-9 rule fires for a person on a paid plan
- **THEN** no mail is sent

#### Scenario: Tips off
- **WHEN** `tips` is disabled
- **THEN** the welcome mail is still sent and onboarding mails are not

### Requirement: Trial ending

The system SHALL send a mail 3 days before a trial ends and a mail on the day it ends, to people still on the trial and not paying, and SHALL replace the current `day11` and `day14` sender without sending twice.

#### Scenario: Three days before
- **WHEN** a trial ends in 3 days and the person is not on a paid plan or a gift
- **THEN** one mail states the end date, the price, what Free keeps and that their data stays, with one button

#### Scenario: On the day
- **WHEN** the trial ends today and the person has not paid
- **THEN** one mail is sent in the morning of their local time, before the downgrade applies

#### Scenario: Promo code
- **WHEN** the on-the-day mail is rendered and a promo code is set in System Settings
- **THEN** it offers 20% off the first year with that code; with no code it shows the early-$7-lock copy instead and never a blank or placeholder code

#### Scenario: Offers off
- **WHEN** `offers` is disabled
- **THEN** no trial-ending mail is sent and the in-app banner still shows the end date

#### Scenario: Switch-over
- **WHEN** the engine takes over from `processTrialLifecycle` and a grant has `day11SentAt` set
- **THEN** the 3-day rule treats it as sent and does not send again

#### Scenario: Gift active
- **WHEN** a person has an active Pro gift
- **THEN** trial-ending mails are skipped with reason `gift-active`

### Requirement: Win-back and still-want-these check

The system SHALL send a win-back mail after 14 days and after 30 days without activity, then a quarterly "still want these?" mail, and SHALL stop optional mail for a person who does not respond.

#### Scenario: Fourteen days
- **WHEN** a free person has had no activity for 14 days
- **THEN** one plain mail asks a single question, replies reach support, and it carries no discount

#### Scenario: Returned
- **WHEN** the person was active after the 14-day mail
- **THEN** the 30-day mail is skipped with reason `returned`

#### Scenario: Paying people
- **WHEN** a person is on a paid plan
- **THEN** win-back rules never fire

#### Scenario: Quarterly check
- **WHEN** 60 days pass after the 30-day mail with no activity, and then every 90 days
- **THEN** one "Still want these?" mail is sent, and if there is no click within 14 days `tips`, `offers`, `updates` and `recap` are switched off with source `sunset`

#### Scenario: No guilt copy
- **WHEN** a win-back or still-want-these template is added
- **THEN** a review check rejects subject lines or bodies that name an absence as a loss or a feeling of the product

### Requirement: Global cap

The system SHALL send a person at most one marketing mail per 3 days (7 days with "Fewer emails"), where marketing means any optional category except `digest`.

#### Scenario: Cap hit
- **WHEN** a rule is due and the person got a marketing mail 2 days ago
- **THEN** the rule is deferred to the first allowed window and re-checked against its skip condition then

#### Scenario: Priority
- **WHEN** a trial-ending and an onboarding mail are due in the same sweep
- **THEN** the trial-ending mail is sent and the onboarding mail is deferred

#### Scenario: Exempt mail
- **WHEN** the mail is transactional, including the welcome mail and the gift notice
- **THEN** it ignores the cap and does not count towards it

#### Scenario: Digest
- **WHEN** the daily digest is sent
- **THEN** it neither counts towards the cap nor is blocked by it

### Requirement: Quiet hours by time zone

The system SHALL send optional mail only between 09:00 and 19:00 in the person's `UserSettings.timeZone`, not at weekends unless the rule is trial-ending, and never inside their own notification quiet hours.

#### Scenario: Night in the person's zone
- **WHEN** a rule is due at 03:00 in the person's zone
- **THEN** it is deferred to the next 09:00 and the ledger records the `until` time

#### Scenario: Invalid zone
- **WHEN** the stored time zone is not a valid IANA name
- **THEN** UTC is used and a warning is logged

#### Scenario: Weekend
- **WHEN** an onboarding rule is due on a Saturday
- **THEN** it is deferred to Monday 09:00, but a trial-ending mail due that day is sent in the window

### Requirement: Recipient eligibility

The system SHALL send only to a verified, non-sandbox, non-suppressed, non-deleted account, and only after the operator identity resolves.

#### Scenario: Sandbox account
- **WHEN** the recipient has `sandboxKind` set
- **THEN** nothing is sent

#### Scenario: Suppressed address
- **WHEN** the address is in `EmailSuppression`
- **THEN** optional mail is skipped with reason `suppressed`

#### Scenario: Operator unresolved
- **WHEN** the operator footer cannot be resolved
- **THEN** no optional mail is claimed or marked sent, one warning is logged per sweep, and the mails go out once it resolves

### Requirement: Monthly recap

The system SHALL send an opt-in monthly recap built from the person's real activity, and SHALL NOT send one when there is too little activity.

#### Scenario: Enough activity
- **WHEN** the first weekday of the month arrives and the person completed at least 3 tasks or habit logs last month and enabled `recap`
- **THEN** one recap with real numbers is sent at 10:00 local

#### Scenario: Thin month
- **WHEN** the person completed fewer than 3
- **THEN** no recap is sent and the ledger records `thin-data`

#### Scenario: No invented numbers
- **WHEN** a figure cannot be computed
- **THEN** it is left out of the mail instead of shown as zero
