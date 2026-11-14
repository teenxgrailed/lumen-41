## ADDED Requirements

### Requirement: Budget place behind a flag

The Budget place SHALL exist only for accounts with the `budget_module` flag on.

#### Scenario: Flag off
- **WHEN** the flag is off for the account
- **THEN** no Budget row is shown, `/budget` returns 404 and `GET /api/budget/nav` returns `{ "enabled": false }`

### Requirement: Free sees a locked place

On Free the Budget row SHALL be shown grey with a PRO pill, SHALL NOT be hideable, and SHALL open a promo with no Budget data.

#### Scenario: Free opens Budget
- **WHEN** a Free account opens `/budget`
- **THEN** the promo shows with Pro buttons (none in store builds) and no frame is loaded

#### Scenario: Free cannot hide the row
- **WHEN** a Free account has `prefs.budgetInSidebar = false`
- **THEN** the row is still shown, and the Settings switch is on and disabled

### Requirement: Pro sees the promo once

On Pro the first visit SHALL show the promo with an Open button that works at once, and Budget SHALL open by itself after 10 seconds; the seen flag SHALL be stored on the account.

#### Scenario: First visit
- **WHEN** a Pro account without `prefs.budgetPromoSeen` opens `/budget`
- **THEN** the promo shows with Open; Open or 10 s later shows Budget and stores `budgetPromoSeen = true`

#### Scenario: Later visit
- **WHEN** a Pro account with `budgetPromoSeen = true` opens `/budget`
- **THEN** Budget shows at once in a frame

### Requirement: Pro can hide the row

A Pro account SHALL be able to hide the Budget row with Settings → General.

#### Scenario: Switch off
- **WHEN** a Pro account turns the switch off
- **THEN** the row disappears from the sidebar and the phone menu, and `/budget` still works
