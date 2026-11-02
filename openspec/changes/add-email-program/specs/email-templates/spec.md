## ADDED Requirements

### Requirement: One layout

Every Needt email SHALL render through `renderEmail`, which produces an HTML part and a plain-text part from the same content.

#### Scenario: Both parts
- **WHEN** any template is rendered
- **THEN** the result has `subject`, `html` and a `text` part that carries the same paragraphs, the button URL and the footer, with no HTML tags

#### Scenario: Readable without images
- **WHEN** images are blocked
- **THEN** every mail is fully readable and its single action is a text link or a table-cell button

#### Scenario: Dark mode and phones
- **WHEN** the client supports `prefers-color-scheme` or a narrow width
- **THEN** the mail adapts, and without that support it still reads correctly in the light layout

### Requirement: Brand voice only

Every email SHALL be sent from Needt and signed as Needt, never as a named person.

#### Scenario: Sender
- **WHEN** a mail is sent
- **THEN** the From name is `Needt`, the reply-to is the support address, and no template contains a personal signature

#### Scenario: Replies
- **WHEN** a person replies to a win-back or welcome mail
- **THEN** the reply reaches the support mailbox

### Requirement: One action per email

Each email SHALL contain at most one button and one question or step.

#### Scenario: Onboarding mail
- **WHEN** an onboarding template is rendered
- **THEN** it names one step and has one button that opens the app at that step

#### Scenario: Length
- **WHEN** a lifecycle template other than the recap is rendered
- **THEN** its body has at most 90 words and a test enforces it

### Requirement: Template set for v1

The system SHALL provide templates for welcome, onboarding day 2, 5 and 9, trial ending 3 days and 0 days, win-back 14 and 30 days, sunset, gift, monthly recap and broadcast, in addition to the existing templates.

#### Scenario: Catalog completeness
- **WHEN** `sampleEmails()` is called
- **THEN** it returns every template above with fixed sample data, and a test fails if a template is registered in the engine but missing from the catalog

#### Scenario: Escaping
- **WHEN** a broadcast body or a gift note contains HTML or quotes
- **THEN** it is escaped in the HTML part and passed through unchanged in the text part

### Requirement: Admin preview

The system SHALL let admins preview every template with sample data.

#### Scenario: Open preview
- **WHEN** an admin opens Admin, Email, Templates
- **THEN** they see each template in an iframe with a light and dark switch, the plain-text part, subject, preheader, category, and the `List-Unsubscribe` headers it would carry

#### Scenario: Send me this
- **WHEN** an admin presses "Send me this"
- **THEN** the template is sent to the admin's own address only, with a `[TEST]` subject prefix, outside the cap and ledger

#### Scenario: Not an admin
- **WHEN** a non-admin calls the preview routes
- **THEN** the response is 403 through `requireAdmin`

### Requirement: Visual direction is configurable

The layout SHALL take its look from named tokens so the direction chosen from the owner's references can be applied without editing templates.

#### Scenario: Accent
- **WHEN** a template uses the accent colour
- **THEN** it is on a mark only, never as a solid fill on a button or surface

#### Scenario: Direction change
- **WHEN** the layout tokens change
- **THEN** snapshots of every catalog entry update in one place and no template file is edited
