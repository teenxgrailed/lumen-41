## ADDED Requirements

### Requirement: Email categories

The system SHALL classify every email as `transactional` (never optional) or one of `tips`, `offers`, `updates`, `recap`, `digest` (optional), and SHALL send an optional email only while that category is enabled for the recipient.

#### Scenario: Default state of a new account
- **WHEN** an account is created and has no preference rows
- **THEN** `tips`, `offers` and `updates` count as enabled, `recap` and `digest` count as disabled, and the preference page shows exactly that

#### Scenario: Category off
- **WHEN** a person has switched `tips` off
- **THEN** no onboarding or tip email is claimed, rendered or sent to them, and the ledger records the skip reason `category-off`

#### Scenario: Transactional mail ignores categories
- **WHEN** a person has switched every optional category off
- **THEN** verification, password reset, receipts, data export, the welcome mail, the gift notice and reminders they set themselves are still sent

#### Scenario: Promotion makes a mail optional
- **WHEN** a new template names a price, a plan or a feature the person has not used
- **THEN** it SHALL be registered in an optional category, and a test fails if a template with a price or plan name is registered as `transactional`

### Requirement: One-click unsubscribe per category

Every optional email SHALL carry a `List-Unsubscribe` header with one `https` URI and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`, and a visible link in the footer, both bound to that mail's category by a signed token that needs no login.

#### Scenario: Mailbox provider POSTs
- **WHEN** a mailbox provider sends `POST` with body `List-Unsubscribe=One-Click` to the URI
- **THEN** the category is switched off at once, with no confirmation page and no redirect, the response is a blank 200, and the ledger records `unsubscribed` with the send it came from

#### Scenario: Link opened with GET
- **WHEN** a person, or a mail scanner that prefetches links, opens the URI with `GET`
- **THEN** nothing changes; the page names the category, shows a button that unsubscribes, and links to the full preference page

#### Scenario: Old link keeps working
- **WHEN** a token with category `product` issued before this change is used
- **THEN** it switches off `tips`, `offers` and `updates`, and the legacy `commercialEmailsOptOutAt` is set

#### Scenario: Bad token
- **WHEN** the token is missing, malformed or not signed by the server
- **THEN** the response is 400 and no preference changes

#### Scenario: Unsubscribe everything
- **WHEN** the person uses the footer link "Unsubscribe from all optional emails"
- **THEN** `tips`, `offers`, `updates` and `recap` are switched off, `digest` is untouched, and transactional mail continues

#### Scenario: Honoured within hours
- **WHEN** a category is switched off by any route
- **THEN** a mail already claimed but not yet handed to Resend is cancelled, and no further mail of that category is sent

### Requirement: Preference page

The system SHALL provide a preference page reachable from Settings with a session and from any optional email with the signed token and no session.

#### Scenario: From Settings
- **WHEN** a signed-in person opens Settings, Notifications, Email
- **THEN** they see each category with one line saying what is in it, a switch, a "Fewer emails" option, and the line "Account and security emails always arrive"

#### Scenario: From an email, no session
- **WHEN** a person opens the page from a footer link on a device where they are not signed in
- **THEN** they can change their categories for that account only, and the page exposes no other account data

#### Scenario: Fewer emails
- **WHEN** the person turns on "Fewer emails"
- **THEN** the global cap window changes from 3 days to 7 days and the setting is shown as on

### Requirement: Migration from the two existing switches

The system SHALL carry today's `commercialEmailsOptOutAt` and `digest` choices into the new model without sending anything to a person who had opted out.

#### Scenario: Previously opted out
- **WHEN** an account has `commercialEmailsOptOutAt` set
- **THEN** `tips`, `offers` and `updates` read as disabled before and after the backfill, with source `legacy`

#### Scenario: Digest unchanged
- **WHEN** an account has `NotificationSettings.digest` on
- **THEN** it stays on and keeps its time; only the unsubscribe token for category `digest` changes the setting

### Requirement: Global email switch

The system SHALL treat `NotificationSettings.emailNotifications = false` as off for every optional category.

#### Scenario: Email switched off in Settings
- **WHEN** `emailNotifications` is false
- **THEN** no optional mail is sent and the preference page shows the categories as paused with a note
