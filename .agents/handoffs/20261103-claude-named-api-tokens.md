---
id: 20261103-claude-named-api-tokens
owner: claude
branch: feat/named-api-tokens
status: active
updated: 2026-11-03T12:00:00Z
objective: A person holds several named personal API tokens at once (Grok Bot, Chrome extension, scripts); each is its own agent-hub identity
---

## Scope

- In scope: `PersonalApiToken` model and additive migration, bearer auth for named and legacy ("Default") tokens, `/api/personal-tokens` session-only routes, Connections UI token list, docs, tests.
- Out of scope: renaming in the UI (API only), token scopes beyond today's personal set, deploys.

## Completed

- Model, migration, service (`src/services/connectors/personal-tokens.ts`), bearer + agent-hub identity (`token:<id>`), routes, UI, docs, changelog fragment, tests.
- Sign-out-everywhere, password reset, email-verification claim and sandbox reset also revoke named tokens.

## Working state

- Files currently dirty or expected to change: none after the commit.
- Foreign changes that must remain untouched: everything in `/Users/lol/Needt` main checkout.

## Verification

- Passed: type-check, lint, check:ui-contracts, check:changelog, full unit suite.
- Not run / still required: migration against a real database (CI), visual baselines if the Connections screenshot changes.

## Decisions and constraints

- The legacy `ConnectorSettings` token stays and is listed as "Default" (`id: default`); `POST /api/connector-settings` still rotates only it.
- Token management is session-only; a bearer token cannot list, make or revoke tokens.
- Up to 25 live named tokens per person; names 1 to 60 characters.

## Blockers

- `None`

## Next action

- Review the PR to `main`; merge deploys the migration.
