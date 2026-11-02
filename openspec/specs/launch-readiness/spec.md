# launch-readiness Specification

## Purpose

One living list of what must be true before and after a public launch, and how to prove
each item. It exists because these checks lived only in `docs/launch/launch-day-checklist.md`
and in chat, and were forgotten between sessions.

Every requirement names who can verify it:

- **Claude**: provable with a command or request; the daily routine runs these.
- **Owner**: lives in a console only the owner can open (Google Cloud, Creem, Coolify UI,
  Sentry settings); Claude never marks these `ok` on its own.

Current results live in `status.md` next to this file. A status is `ok` only when the check
was actually run on the stated date; otherwise it is `unverified` or `fail`.

## Requirements

### Requirement: Production runs the current main build

Web and worker SHALL run the same build as the head of `main`.

#### Scenario: Health check (Claude)

- **WHEN** `curl -s https://use.needt.app/api/health` is run
- **THEN** it returns HTTP 200 with `ok: true` and `db: "ok"` (not `migrations-pending`)
- **AND** `buildSha` equals `workerBuildSha`
- **AND** `buildSha` equals `git rev-parse origin/main`, or the last `main` deploy is still
  running in Coolify (green CI on `main` does not mean production moved)

### Requirement: Google sign-in is enabled

Production SHALL offer Google sign-in.

#### Scenario: Provider is configured (Claude)

- **WHEN** `curl -s https://use.needt.app/api/auth/providers` is run
- **THEN** the response contains a `google` provider

#### Scenario: Consent screen is in production (Owner)

- **WHEN** the owner opens Google Cloud Console, OAuth consent screen
- **THEN** publishing status is **In production**, not Testing (Testing admits at most 100
  listed test users)

#### Scenario: Sensitive scopes are verified (Owner)

- **WHEN** the owner checks app verification for the calendar scopes and `gmail.readonly`
- **THEN** verification is granted, or the launch copy calls Google connections limited
  (launch checklist 3.6)

#### Scenario: Redirect URIs are registered (Owner)

- **WHEN** the owner opens the OAuth client
- **THEN** these redirect URIs are listed:
  `https://use.needt.app/api/auth/callback/google`,
  `https://use.needt.app/api/calendar/google`,
  `https://use.needt.app/api/mail/oauth/google/callback`

#### Scenario: A non-owner account can sign in and connect a calendar (Owner)

- **WHEN** a Google account that is not the owner's signs in and connects its calendar
- **THEN** sign-in succeeds without the "app isn't verified" wall and events appear

### Requirement: Legal pages are real

`/terms` and `/privacy` SHALL be the final texts.

#### Scenario: Pages serve final text (Claude)

- **WHEN** `https://use.needt.app/terms` and `https://use.needt.app/privacy` are fetched
- **THEN** both return 200 and contain neither `{{` nor `CHECK`

#### Scenario: Operator is decided (Owner)

- **WHEN** the owner reviews `src/lib/legal/operator.ts`
- **THEN** the operator and `DATAREP_CONTACT` match the legal entity that sells Needt

### Requirement: Payments are approved before checkout opens

Checkout SHALL open only after Creem approves the store.

#### Scenario: Creem review (Owner)

- **WHEN** the owner opens the Creem dashboard
- **THEN** the store is approved and Pro $7/month, Pro $59/year and Lifetime $149 are live

#### Scenario: Prices shown match the decided prices (Claude)

- **WHEN** `https://needt.app/pricing/` is fetched
- **THEN** it shows $7, $59 and $149 and no other paid price for those plans

### Requirement: Launch flags are in the intended state

#### Scenario: Sign-ups (Claude)

- **WHEN** `curl -s https://use.needt.app/api/auth/public-signup` is run
- **THEN** it returns `{"enabled":true}` on and after launch day

#### Scenario: Checkout flag follows Creem (Owner)

- **WHEN** the owner runs `node scripts/admin/set-flag.cjs --key billing_checkout` (dry run)
  in the Coolify terminal
- **THEN** it is enabled only if the Creem review scenario is `ok`

### Requirement: Email and background work run

#### Scenario: Worker is alive (Claude)

- **WHEN** the health check runs
- **THEN** `workerBuildSha` is present and equals `buildSha`

#### Scenario: Resend delivers (Owner)

- **WHEN** a test email is sent from production
- **THEN** it arrives and is not in spam

### Requirement: Monitoring and backups

#### Scenario: Sentry receives events (Owner)

- **WHEN** an admin calls `POST /api/admin/sentry-check`
- **THEN** the returned event id is visible in Sentry and alerts reach the owner's phone

#### Scenario: Daily encrypted backups (Owner)

- **WHEN** the owner opens Coolify backups for PostgreSQL
- **THEN** the last backup is under 24 hours old and retention is 30 days, not more

### Requirement: AI spend is capped

#### Scenario: Cap is set (Owner)

- **WHEN** the owner reads the env of the `needt` app in Coolify
- **THEN** `NEEDT_AI_MONTHLY_ACTION_CAP` is set to the decided cap

### Requirement: The owner's Mac has room for agents

Agent worktrees each hold about 1.6 GB of `node_modules`; a full disk stops every agent.

#### Scenario: Free space (Claude, local sessions only)

- **WHEN** `df -h /System/Volumes/Data` is run at the start of a fan-out
- **THEN** at least 1 GB stays free after the planned worktrees, and finished worktrees are
  removed
