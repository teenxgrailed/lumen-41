## ADDED Requirements

### Requirement: Admin grants a Pro gift

An admin SHALL be able to give a person Pro for 1 month, 3 months or 1 year with an optional personal line, from the user's page in Admin, and the grant SHALL write an admin audit row.

#### Scenario: Grant
- **WHEN** an admin grants 3 months with the line "Thanks for the bug report"
- **THEN** in one transaction a `ProGift` row is created, the person's `Subscription` becomes PRO and ACTIVE with `currentPeriodEnd` three months out and no payment ids, and an audit row `user.gift_pro` records actor, target, months and end date

#### Scenario: Pro at once, no card
- **WHEN** the grant completes
- **THEN** the person's effective plan is PRO on their next request, and no checkout or card is involved

#### Scenario: Already pays
- **WHEN** the person has a subscription with a payment provider id
- **THEN** the grant is refused with "This person already pays for Pro" and nothing changes

#### Scenario: Stacking
- **WHEN** the person already has an active gift ending on a date
- **THEN** the new gift starts on that date, so the earlier gift is never shortened

#### Scenario: During a trial
- **WHEN** the person is in their trial
- **THEN** the gift is granted, the trial rows are untouched, no second trial is created, and trial-ending mails are skipped while the gift is active

#### Scenario: Personal line limits
- **WHEN** the line is longer than 280 characters or contains control characters
- **THEN** the grant is refused

#### Scenario: Not an admin
- **WHEN** a non-admin calls the grant route
- **THEN** the response is 403

### Requirement: Gift email

The system SHALL send one email titled "You've got a gift from Needt" when a gift starts, as transactional mail from Needt.

#### Scenario: Content
- **WHEN** the mail is rendered
- **THEN** it shows the length of the gift, the end date, the personal line if given, and one button that opens the app on the gift screen; it states "No card, nothing to cancel" and names no price

#### Scenario: Sent despite opt-outs
- **WHEN** the person has switched every optional category off
- **THEN** the gift mail is still sent because it reports a change to their account

#### Scenario: Window
- **WHEN** the grant happens at 03:00 in the person's zone
- **THEN** the mail is held until 08:00 local and sent then

#### Scenario: Sandbox or suppressed address
- **WHEN** the recipient is a sandbox account or a suppressed address
- **THEN** the gift is still granted and the mail is skipped with the reason recorded

### Requirement: Gift screen in the app

The app SHALL show a gift screen once, on the next load after a gift starts, until the person dismisses it.

#### Scenario: First load
- **WHEN** the person opens Needt with an unseen gift
- **THEN** a full-screen sheet shows the months, the end date, the personal line and one button "Start using Pro"

#### Scenario: Dismissed
- **WHEN** the person presses the button or closes the sheet
- **THEN** `seenAt` is set and the sheet does not appear again for that gift

#### Scenario: Reduced motion
- **WHEN** the system asks for reduced motion
- **THEN** the sheet appears without animation

### Requirement: Gift expiry

The system SHALL return a gifted account to Free when the gift ends, unless the person paid in the meantime.

#### Scenario: Gift ends
- **WHEN** an hourly step finds a gift row whose end passed and whose subscription has no payment ids
- **THEN** the subscription becomes FREE, an audit row `gift.expired` is written, and the person's data is untouched

#### Scenario: Person paid meanwhile
- **WHEN** the subscription now has a payment provider id
- **THEN** the step leaves it alone

#### Scenario: Revoke
- **WHEN** an admin revokes a gift
- **THEN** `revokedAt` is set, the subscription returns to FREE if it has no payment ids, and an audit row is written

#### Scenario: Sandbox accounts
- **WHEN** the row belongs to a sandbox account
- **THEN** the expiry step never touches it
