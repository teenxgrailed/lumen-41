# Sandbox accounts

Accounts the app provisions itself, so a directory reviewer (Anthropic,
OpenAI, Smithery) can sign in and test the MCP connector without anybody
signing up by hand. The same mechanism is meant to carry a public demo account
later (`User.sandboxKind = publicDemo`); only the reviewer kind is provisioned
today.

Code: `src/services/sandbox/` (provisioning, seed, reset), `src/lib/sandbox/`
(the lockdown), `src/components/sandbox/SandboxBanner.tsx`.

## Turning it on

1. Set on **both** the web app and the worker (Coolify):

   | Variable                      | Meaning                                                       |
   | ----------------------------- | ------------------------------------------------------------- |
   | `SANDBOX_REVIEWER_EMAIL`      | The reviewer's sign-in address. Any address; no inbox needed. |
   | `SANDBOX_REVIEWER_PASSWORD`   | Its password, at least 12 characters.                         |
   | `SANDBOX_AI_DAILY_ACTION_CAP` | Optional. Hosted AI actions per day, default 15.              |

   Unset (or half-set) means no sandbox account and nothing happens.

2. Admin → Feature flags: turn `sandbox_accounts` on at 100%.

3. Restart the worker, or press **Reset sandbox now** in Admin → Users. Either
   creates the account. Hand the reviewer the email and password.

Provisioning is idempotent and runs at every worker start, before every reset
and from the admin button. It never turns an existing real account into a
sandbox: if the address already belongs to somebody, it is refused and logged.
Changing `SANDBOX_REVIEWER_PASSWORD` takes effect at the next run and signs the
old sessions out.

## What the account is

- Email confirmed at creation (no inbox), password sign-in, no MFA or magic
  link.
- Pro, through an ACTIVE `Subscription` row with no payment ids (a comp that
  never expires and no webhook touches).
- `User.sandboxKind = reviewer`, shown as a badge in Admin → Users.
- A slim banner in the app: "Sandbox account — resets nightly".
- Seeded with a planner: 8 tasks across 2 projects (some today and tomorrow,
  one done), 3 calendar events this week, 2 documents, 2 habits with a few
  logs, 1 goal with progress and a check-in, 2 memory rows. Dates are relative
  to the reset, in the account's time zone (UTC unless the reviewer changes
  it).

## Nightly reset

The worker's `account-lifecycle` queue runs `sandbox-nightly-reset` at
04:00 UTC (`resetSandboxAccounts`), and the admin button runs the same thing.
For every row with a `sandboxKind`:

- Everything the account made is deleted (tasks, projects, documents, habits,
  goals, events, memories, boards, moodboards, AI conversations and usage,
  notifications, logs). The account itself, its settings, plan and workspace
  stay, so the id an MCP client is connected to is the same in the morning.
- OAuth tokens older than 24 hours are revoked. A client that refreshed within
  the day keeps working; otherwise the reviewer reconnects. The personal
  connector token is cleared.
- The planner above is written again.

Only rows already marked as sandboxes are ever reset; the reset checks the mark
again inside the transaction that deletes.

## What is locked

A sandbox account gets `403 { code: "SANDBOX_LOCKED", capability, error }`
with a sentence that says what it cannot do. The check is server-side in two
places that share one table (`src/lib/sandbox/policy.ts`):

- **Middleware**: the session token carries `sandboxKind` from sign-in, so a
  locked cookie-session API route is refused before it runs.
- **Routes and services** (`src/lib/sandbox/guard.ts`, `refuseSandbox`): for
  bearer routes the middleware cannot see (MCP, `/api/connect/*`) and as a
  second check on the high-stakes routes.

| Capability         | Refused                                                                                                                                                                |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `account_identity` | Password reset (request and set); there is no email or name change                                                                                                     |
| `account_delete`   | Account deletion                                                                                                                                                       |
| `account_export`   | Account export                                                                                                                                                         |
| `billing`          | Checkout, billing portal, trial, plan changes                                                                                                                          |
| `providers`        | Google / Outlook / CalDAV, IMAP and mail OAuth, Todoist / Notion imports (also through MCP), file import, task sync, integrations, Pinterest, own AI keys and AI OAuth |
| `webhooks`         | Connector webhook settings                                                                                                                                             |
| `api_tokens`       | Personal `needt_…` tokens (MCP OAuth is the way in)                                                                                                                    |
| `invites`          | Workspace invites                                                                                                                                                      |
| `public_share`     | Public page links, page and moodboard sharing, booking pages                                                                                                           |
| `uploads`          | Page and moodboard uploads; task files are capped at 1 MB                                                                                                              |
| `admin`            | Every admin route and page, whatever the role says                                                                                                                     |
| `outbound_email`   | Verification mail; nothing at all is mailed to a sandbox address                                                                                                       |

Hosted AI is capped at `SANDBOX_AI_DAILY_ACTION_CAP` actions with no slow
lane; the nightly reset clears the usage, so the cap is per day.

Everything else works on the account's own data, including the MCP OAuth
connection and every `needt_*` read and write tool.

## The public demo, later

`publicDemo` is in the enum and every rule above already applies to it. What
is missing is provisioning it (`sandboxConfigsFromEnv`, marked `//todo`) and
deciding how many people may share one account at once.
