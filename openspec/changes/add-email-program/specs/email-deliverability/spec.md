## ADDED Requirements

### Requirement: RFC 8058 headers on optional mail

The system SHALL add `List-Unsubscribe: <https-URI>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` to every optional email, built from a token that names the recipient and category.

#### Scenario: Headers present
- **WHEN** an optional email is handed to Resend
- **THEN** its headers contain exactly one `https` URI in `List-Unsubscribe` and the `List-Unsubscribe-Post` header

#### Scenario: Signed by the domain
- **WHEN** the sending domain is verified in Resend
- **THEN** a seed test to Gmail, Outlook and Yahoo mailboxes shows both headers in the raw message and a passing DKIM signature, and the result is recorded before the engine is switched on

#### Scenario: Transactional mail
- **WHEN** the mail is transactional
- **THEN** it carries no unsubscribe headers

### Requirement: Resend webhook

The system SHALL receive Resend events at `POST /api/webhooks/resend`, verify the Svix signature on the raw body, and apply each event once.

#### Scenario: Bad signature
- **WHEN** the signature is missing, wrong, or its timestamp is older than 5 minutes
- **THEN** the response is 400 and nothing is stored

#### Scenario: Duplicate delivery
- **WHEN** Resend retries an event with the same `svix-id`
- **THEN** it is acknowledged with 200 and not applied again

#### Scenario: Hard bounce
- **WHEN** `email.bounced` arrives for a permanent failure
- **THEN** the address is added to `EmailSuppression` with reason `bounce`, and later optional mail to it is skipped

#### Scenario: Soft bounce
- **WHEN** `email.bounced` or `email.delivery_delayed` arrives for a temporary failure
- **THEN** it is counted on the ledger row and the address is not suppressed

#### Scenario: Complaint
- **WHEN** `email.complained` arrives
- **THEN** the address is suppressed with reason `complaint`, `tips`, `offers`, `updates` and `recap` are switched off with source `complaint`, and the event is shown in Admin

#### Scenario: Provider suppression
- **WHEN** `email.suppressed` arrives
- **THEN** the address is mirrored into `EmailSuppression`

#### Scenario: Unknown event
- **WHEN** an event type is not handled
- **THEN** it is acknowledged with 200 and ignored

### Requirement: Suppression list

The system SHALL keep its own suppression list in Postgres and consult it before every optional send.

#### Scenario: Case-insensitive
- **WHEN** the address differs only by case
- **THEN** it matches the suppression row

#### Scenario: Transactional to a suppressed address
- **WHEN** a security mail is due to a suppressed address
- **THEN** it is attempted, and a repeat bounce is logged without crashing the caller

#### Scenario: Admin removal
- **WHEN** an admin removes a row
- **THEN** an audit row is written and the page states that Resend's own suppression must also be cleared in its dashboard

### Requirement: Authentication and monitoring

The sending domain SHALL have aligned SPF and DKIM and a DMARC policy of at least `p=none` with reports delivered to a mailbox the owner reads, and the engine SHALL stop itself when complaints are high.

#### Scenario: Pre-launch check
- **WHEN** the engine is about to be switched on
- **THEN** a checklist in the runbook confirms SPF, DKIM and DMARC alignment and Google Postmaster Tools access for the domain

#### Scenario: Complaint rate
- **WHEN** complaints exceed 0.1% of optional sends over 7 days
- **THEN** the flag `email-lifecycle` is turned off automatically and the owner is notified

#### Scenario: Unsubscribe latency
- **WHEN** a one-click POST arrives
- **THEN** the preference is written in the same request, well inside the 48 hours the providers allow

### Requirement: Tracking only in the first month

Open and click tracking SHALL be on for the first month after launch and then switch off automatically, driven by the date in System Settings `email.trackingEndsAt`. Our own templates SHALL NOT contain pixels or rewritten links; tracking is Resend's domain feature.

#### Scenario: Window open
- **WHEN** now is before `email.trackingEndsAt`
- **THEN** opened and clicked events are counted on the ledger row

#### Scenario: Window closed
- **WHEN** the date has passed
- **THEN** a daily step turns tracking off at the domain (Resend API, when `RESEND_DOMAIN_ID` is set), events are ignored, and Admin shows a banner until the dashboard is confirmed off

#### Scenario: Templates
- **WHEN** the catalog is rendered
- **THEN** a test fails if any output contains a tracking pixel
