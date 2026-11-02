## ADDED Requirements

### Requirement: Operator identity from one source

The footer of every optional email SHALL show the owner's name and a virtual mailbox address, both read from admin System Settings (`email.footerName`, `email.footerAddress`), and nowhere else.

#### Scenario: Resolved
- **WHEN** both settings hold real values
- **THEN** the footer shows the name, the address, the reason the person receives the mail, the unsubscribe link and the preference link, in both HTML and plain text

#### Scenario: Address unset
- **WHEN** either System Settings value is unset or blank
- **THEN** only transactional email is sent, no optional email is claimed, a single warning is logged per sweep, and the Admin Email page shows a banner naming the missing setting

#### Scenario: Placeholder value
- **WHEN** the address or name still matches the `{{NAME}}` placeholder pattern
- **THEN** it counts as unset

### Requirement: Never render a placeholder

The system SHALL NOT render a bracketed or templated placeholder in any email, including previews sent to admins.

#### Scenario: Render guard
- **WHEN** a non-transactional email is rendered with no resolvable operator
- **THEN** `renderEmail` throws, and no output is produced

#### Scenario: Test guard
- **WHEN** the test suite renders the full catalog
- **THEN** it fails if any output contains `[OWNER`, `{{`, `}}` or `SAMPLE` outside the admin preview frame, and the constant `FOOTER_ADDRESS_PLACEHOLDER` no longer exists

#### Scenario: Preview with no address
- **WHEN** an admin previews a template while the address is unset
- **THEN** the preview frame shows a visible "address not set" banner above the mail, and the mail itself is not rendered with fake text

### Requirement: Footer content by category

The footer SHALL state, for optional mail, why the person receives it and how to stop it, and for transactional mail, why it was sent.

#### Scenario: Optional mail
- **WHEN** an optional email is rendered
- **THEN** the footer has "You get this because you have a Needt account", an Unsubscribe link for that category, a link to email preferences, and the operator name and address

#### Scenario: Transactional mail
- **WHEN** a transactional email is rendered
- **THEN** the footer states the reason it was sent and has no unsubscribe link; the address is shown when resolved and omitted when not

### Requirement: Legal basis recorded

The system SHALL record, per category and recipient, how the preference came to be.

#### Scenario: Source stored
- **WHEN** a preference row is written
- **THEN** its `source` is one of `default`, `legacy`, `settings`, `unsubscribe-link`, `complaint`, `sunset`, `admin`, with a timestamp, so consent history can be shown on request

#### Scenario: Data export and deletion
- **WHEN** a person exports or deletes their account
- **THEN** their preference rows are included in the export and removed on deletion, while the suppression row for a bounced address stays hashed so it is not mailed again
