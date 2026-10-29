# Environment Template

Use this as the reference for `.env.local` in development or `.env` in Docker/production. Do not commit real secrets.

## Required With Safe Local Defaults

```bash
DATABASE_URL="postgresql://fluid:fluid@localhost:5432/fluid_calendar"
DIRECT_URL="postgresql://fluid:fluid@localhost:5432/fluid_calendar"
NEXTAUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_SITE_URL="http://localhost:3000"
NEXTAUTH_SECRET="replace-with-a-random-32-plus-character-secret"
CRON_SECRET="replace-with-random-cron-secret"
REDIS_URL="redis://localhost:6379"
RATE_LIMIT_HASH_SECRET="replace-with-a-separate-random-secret"
WEBHOOK_BASE_URL="http://localhost:3000"
SENTRY_DSN=""
SENTRY_ENVIRONMENT="development"
NEXT_PUBLIC_SENTRY_DSN=""
NEXT_PUBLIC_SENTRY_ENVIRONMENT="development"
```

Notes:

- For Docker Compose app containers, use `postgresql://fluid:fluid@db:5432/fluid_calendar`.
- For Vercel + Neon, use the pooled Neon URL for `DATABASE_URL` and the direct non-pooled Neon URL for `DIRECT_URL`.
- `NEXTAUTH_URL` must match the exact URL opened in the browser because OAuth redirects are derived from it.
- `NEXTAUTH_SECRET` has a local fallback in code, but it should always be set explicitly.
- `CRON_SECRET` protects Vercel Cron endpoints and must be supplied as the `x-cron-secret` header when testing manually.
- `REDIS_URL` is shared by the web process and the separate BullMQ worker. In Docker/Coolify, point both services at the same Redis instance.
- `RATE_LIMIT_HASH_SECRET` is required in production and must be a distinct random value. It hashes rate-limit identifiers before Redis receives them.
- `WEBHOOK_BASE_URL` is the public HTTPS origin providers call for calendar change notifications. It defaults to `NEXTAUTH_URL`; set it explicitly when the public webhook origin differs.
- `SENTRY_DSN` and `SENTRY_ENVIRONMENT` configure server, edge, worker, and collaboration telemetry at runtime. `NEXT_PUBLIC_SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_ENVIRONMENT` are public browser configuration: Next.js inlines them during `npm run build`, so changing them after an image is built does not enable browser telemetry for that image.
- `NEEDT_BUILD_SHA` is injected by the production CI image build. Do not set it manually in Coolify. Sentry source-map settings (`SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT`) are build-only and are intentionally not configured here; a later authorized pipeline must use a BuildKit secret for the token, never a build argument or runtime image environment variable.

## Human-Supplied Calendar OAuth

```bash
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
AZURE_AD_CLIENT_ID=""
AZURE_AD_CLIENT_SECRET=""
AZURE_AD_TENANT_ID="common"
# Sign-in providers (docs/operations/sign-in-providers.md). System Settings
# values win over these. A provider shows on sign-in only when fully set.
APPLE_CLIENT_ID=""
APPLE_TEAM_ID=""
APPLE_KEY_ID=""
APPLE_PRIVATE_KEY=""
GITHUB_CLIENT_ID=""
GITHUB_CLIENT_SECRET=""
DISCORD_CLIENT_ID=""
DISCORD_CLIENT_SECRET=""
TWITTER_CLIENT_ID=""
TWITTER_CLIENT_SECRET=""
LINKEDIN_CLIENT_ID=""
LINKEDIN_CLIENT_SECRET=""
OPENAI_SIWC_CLIENT_ID=""
OPENAI_SIWC_CLIENT_SECRET=""
```

Google is needed for Google Calendar and Google Tasks. Azure AD is needed for Outlook Calendar and Microsoft task sync. These can also be configured from the in-app System Settings where supported.

## Todoist Import (optional)

```bash
TODOIST_CLIENT_ID=""
TODOIST_CLIENT_SECRET=""
```

Register an app at https://developer.todoist.com/appconsole.html with the OAuth redirect URL `<NEXTAUTH_URL>/api/imports/todoist/callback`. Without these values Settings -> Data shows the Todoist import as not set up, and `POST /api/imports` answers `503 NOT_CONFIGURED` (a Todoist personal API token passed as `token` still works). The import is also behind the `imports` feature flag, off unless a flag row turns it on.

## Notion Import (optional)

```bash
NOTION_CLIENT_ID=""
NOTION_CLIENT_SECRET=""
```

Create a public integration at https://www.notion.so/profile/integrations (Developer portal -> Connections -> New connection, type Public) with the OAuth redirect URI `<NEXTAUTH_URL>/api/imports/notion/callback` (production: `https://use.needt.app/api/imports/notion/callback`) and the "Read content" capability. The client ID and secret are on the connection's Configuration tab. Without these values Settings -> Data shows the Notion import as not set up, and `POST /api/imports` answers `503 NOT_CONFIGURED` (a Notion internal integration token passed as `token` still works). People choose which pages and databases to share in Notion's own page picker during the consent step; only those are imported. The import is behind the same `imports` feature flag as Todoist.

## Apple / iCloud Calendar

No env vars are required for Apple Calendar in the current baseline. Use the CalDAV connection form with:

- Server URL: `https://caldav.icloud.com`
- Username: Apple ID email address
- Password: Apple app-specific password supplied by the human

## Email

```bash
RESEND_API_KEY=""
RESEND_FROM_EMAIL=""
```

Resend is optional for local development unless testing password reset or email notification flows.

```bash
OPERATOR_POSTAL_ADDRESS=""   # one line; the operator's postal address
```

`OPERATOR_POSTAL_ADDRESS` goes in the footer of every commercial email (trial
reminders and anything else that sells Pro). While it is empty no commercial
email is sent at all: the worker logs "Commercial email not sent" and the trial
reminders wait. Transactional mail (verify, password reset, receipts, data
export, reminders) does not depend on it. The older `EMAIL_FOOTER_ADDRESS` is
still read as a fallback.

## Legal

```bash
DMCA_AGENT_REG_NO=""         # e.g. DMCA-1234567, from the US Copyright Office
```

The Terms print the designated-agent registration line only when
`DMCA_AGENT_REG_NO` is set. Register the agent first at
https://dmca.copyright.gov/ (owner action; there is a fee).

## AI Configuration

These are not used by the Phase 0 app yet, but are reserved for the planner AI layer:

```bash
ANTHROPIC_API_KEY=""
OPENAI_API_KEY=""
AI_CUSTOM_URL=""
AI_ENCRYPTION_KEY=""
NEEDT_AI_API_KEY=""
NEEDT_AI_MODEL="z-ai/glm-5.3-flash"
NEEDT_AI_BASE_URL="https://openrouter.ai/api/v1"
NEEDT_AI_GATEWAY_PROVIDERS=""
NEEDT_AI_FREE_ACTION_CAP="20"
NEEDT_AI_MONTHLY_ACTION_CAP="300"
NEEDT_AI_LIFETIME_ACTION_CAP="300"
NEEDT_AI_CEILING_MULTIPLIER="2"
NEEDT_ALERT_EMAIL=""
```

Sandbox accounts (docs/sandbox-accounts.md). Unset means none; also needs the
`sandbox_accounts` feature flag at 100%. Set them on the web app and the
worker alike.

```env
SANDBOX_REVIEWER_EMAIL=""
SANDBOX_REVIEWER_PASSWORD=""
SANDBOX_AI_DAILY_ACTION_CAP="15"
```

`NEEDT_AI_API_KEY` is the deployment-wide hosted key. The defaults point at
OpenRouter serving GLM 5.3 Flash; any OpenAI-compatible endpoint works by
setting `NEEDT_AI_BASE_URL` and `NEEDT_AI_MODEL`.

Hosted requests always ask the gateway to skip providers that may retain or
train on the data. `NEEDT_AI_GATEWAY_PROVIDERS` narrows routing further to a
comma-separated allow-list of gateway provider slugs — set it to pin inference
to named hosts in particular countries. Leave it empty to let the gateway
choose among the hosts that already satisfy the no-retention requirement; a
slug that does not exist would refuse every request, so verify a value against
a live key before relying on it.

To call Z.ai (Zhipu) directly instead, set
`NEEDT_AI_BASE_URL="https://api.z.ai/api/paas/v4"` and
`NEEDT_AI_MODEL="glm-5.3-flash"`. That host is outside the US and the EU and
must be added to the subprocessor list and the Privacy policy first; see
`docs/operations/ai-provider.md`.

A key the user brings themselves is never metered, never capped and never
slowed, and it is honoured on every plan including Free.

`NEEDT_ALERT_EMAIL` receives critical operations alerts — queue backlogs, missed cron windows — through the same Resend sender as product email. Leave it empty and critical alerts stay in Sentry only; warnings never email regardless.

`NEEDT_AI_API_KEY` enables the hosted OpenAI-compatible fallback (DeepSeek by default). `NEEDT_AI_MODEL`, `NEEDT_AI_BASE_URL`, `NEEDT_AI_MONTHLY_ACTION_CAP`, and `NEEDT_AI_LIFETIME_ACTION_CAP` configure the deployment-wide model and paid-plan allowances. `NEEDT_AI_CEILING_MULTIPLIER` defaults to `2` and bounds the slower hosted-AI overflow window. Pro and Lifetime users can instead supply their own provider key in Settings. Keys entered in Settings are encrypted at rest with `AI_ENCRYPTION_KEY` (or `NEXTAUTH_SECRET` when it is omitted).

### Custom AI OAuth (optional)

Set these only when the Custom AI service supports OAuth 2.0 authorization-code flow with PKCE:

```bash
AI_CUSTOM_OAUTH_AUTHORIZATION_URL="https://ai.example.com/oauth/authorize"
AI_CUSTOM_OAUTH_TOKEN_URL="https://ai.example.com/oauth/token"
AI_CUSTOM_OAUTH_CLIENT_ID=""
AI_CUSTOM_OAUTH_CLIENT_SECRET=""
AI_CUSTOM_OAUTH_SCOPES="planner.read planner.write offline_access"
```

- `AI_CUSTOM_URL` is the planner's Custom AI API endpoint and is automatically prefilled in Settings for every user.
- `AI_CUSTOM_OAUTH_CLIENT_SECRET` and `AI_CUSTOM_OAUTH_SCOPES` are optional; the client secret should be omitted for public PKCE clients.
- Register `${NEXTAUTH_URL}/api/ai/oauth/custom/callback` as the exact OAuth redirect URI.
- Once these values are configured, a user selects Custom and clicks **Connect** in Settings—no OAuth URLs or client credentials need to be entered by the user.
- OpenAI and Anthropic direct API access uses API keys, not account OAuth tokens. Settings links users to the relevant key page before they paste and connect their key.

## Creem Billing

Creem is optional. When these values are absent, the app starts normally on the
Free plan and Settings shows a neutral "purchases not configured" state.

```bash
CREEM_API_KEY=""
CREEM_WEBHOOK_SECRET=""
CREEM_PRODUCT_PRO_MONTHLY=""
CREEM_PRODUCT_PRO_YEARLY=""
CREEM_PRODUCT_LIFETIME=""
CREEM_API_URL=""
CREEM_STUDENT_DISCOUNT_CODE=""
```

- `CREEM_STUDENT_DISCOUNT_CODE` is the code of the one Creem discount behind
  the student price: 40%, duration "forever", restricted to the Pro monthly
  and Pro yearly products (never Lifetime). Checkout pre-applies it for a
  verified student. Unset, nobody gets the student price and Settings does not
  show it as applying. Set it on web and worker. See `docs/students.md`.

- Create three Creem products matching Needt Pro monthly ($6), Needt Pro yearly
  ($60), and Needt Lifetime ($79), then put their product IDs in the matching
  variables.
- Configure the Creem webhook endpoint as
  `${NEXTAUTH_URL}/api/billing/webhook` and copy its signing secret into
  `CREEM_WEBHOOK_SECRET`.
- Leave `CREEM_API_URL` empty for the normal Creem environment. Set it only
  when Creem supplies a test or custom API origin.
- Creem acts as merchant of record for checkout, invoices, subscription
  management, and applicable sales tax.

## Web Push

```bash
NEXT_PUBLIC_VAPID_PUBLIC_KEY=""
VAPID_PRIVATE_KEY=""
VAPID_SUBJECT="mailto:you@example.com"
```

Web push is optional and disabled by default in Settings. All three values are
runtime secrets/configuration on both web and worker. The server exposes the
public key to authenticated clients; the private key never reaches the
browser. Expired (`404`/`410`) subscriptions are pruned and email is used as a
fallback. On iOS, Web Push requires Needt to be installed to the Home Screen.

## Monitoring and Analytics (optional)

```bash
NEEDT_HEARTBEAT_URL=""
NEXT_PUBLIC_UMAMI_WEBSITE_ID=""
UMAMI_HOST=""
UMAMI_LANDING_WEBSITE_ID=""
```

- `UMAMI_HOST` (for example `https://stats.needt.app`) and
  `UMAMI_LANDING_WEBSITE_ID` (the needt.app site's id in Umami) are read at
  runtime by the Creem webhook. When both are set, a completed checkout sends
  one server-side `purchase` event `{ plan: pro_year | pro_month | lifetime }`
  to `POST {UMAMI_HOST}/api/send`, so the landing funnel ends in a payment. No
  personal data is sent; a missing value skips it, a failure is only logged.

- `NEEDT_HEARTBEAT_URL` is read by the worker. When set, the worker sends a
  `GET` to it on start and on every release-heartbeat tick, so an external
  uptime monitor (a push/heartbeat check) notices a stopped worker. Failures
  and timeouts (5s) are logged as warnings and never stop the worker.
- `NEXT_PUBLIC_UMAMI_WEBSITE_ID` turns on cookieless Umami analytics from
  `https://stats.needt.app`. Next.js inlines it during `npm run build`; in CI
  it comes from the repository variable of the same name and may be empty.
