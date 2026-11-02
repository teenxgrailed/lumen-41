# launch-readiness status

The daily routine updates the Claude rows. Owner rows change when the owner reports a
result. `ok` means the check ran on that date and passed.

| Check | Who | Status | Checked | Evidence |
|---|---|---|---|---|
| Health: `ok`, `db: ok`, web SHA = worker SHA | Claude | ok | 2026-11-02 | both `26a5173` |
| Production SHA = `origin/main` | Claude | ok | 2026-11-02 | `26a5173` |
| Google provider in `/api/auth/providers` | Claude | ok | 2026-11-02 | `google` listed |
| Google consent screen In production | Owner | unverified | | |
| Google scopes verified (calendar, `gmail.readonly`) | Owner | fail | 2026-11-02 | blocked on "App functionality": demo video, reviewer access |
| Google redirect URIs (3) | Owner | unverified | | |
| Non-owner Google sign-in + calendar | Owner | unverified | | |
| `/terms`, `/privacy` final | Claude | ok | 2026-11-02 | 200, no `{{`/`CHECK` |
| Legal operator decided | Owner | ok | 2026-11-03 | FOP Nataliia Antoniuk in Terms/Privacy (#505); tax 3rd group pending (deadline 12.11) |
| Creem review approved, 3 products live | Owner | unverified | 2026-11-03 | 3 live products + 2 discounts created, IDs in Coolify; review answer pending; payee-name question to Creem open |
| Pricing page shows $7 / $59 / $149 | Claude | ok | 2026-11-02 | all three present |
| Sign-ups flag on | Claude | ok | 2026-11-02 | `{"enabled":true}` |
| Checkout flag follows Creem | Owner | unverified | | |
| Worker alive | Claude | ok | 2026-11-02 | `workerBuildSha` present |
| Resend delivers | Owner | unverified | | |
| Sentry events and alerts | Owner | unverified | | |
| Backups daily, 30 days | Owner | ok | 2026-11-02 | daily to S3, last success 00:00 UTC, 14 kept locally (checked by Claude via Coolify) |
| AI action cap set | Owner | ok | 2026-11-02 | `NEEDT_AI_MONTHLY_ACTION_CAP` present on `needt` (value not readable; checked by Claude via Coolify) |
| Free disk ≥ 1 GB after fan-out | Claude | ok | 2026-11-02 | 4.7 GB free |
| Creem webhook + live secrets on needt and need-worker | Owner | unverified | 2026-11-03 | owner reports done; webhook delivery not yet seen |
| `RESEND_WEBHOOK_SECRET` set (bounce/complaint suppression) | Owner | fail | 2026-11-03 | key missing on both apps (Coolify) → /api/webhooks/resend returns 503 |
| Google Tasks API enabled, redirect URI, `tasks` scope in Data Access | Owner | unverified | 2026-11-03 | API enabled (owner screenshot); redirect + scope not done |
| Free has no hosted AI | Claude | ok | 2026-11-03 | `NEEDT_AI_FREE_ACTION_CAP=0` on needt and need-worker |
| DMCA agent registered | Owner | unverified | 2026-11-03 | Needt task; number → `DMCA_AGENT_REG_NO` |
| Launch sweep findings | Claude | ok | 2026-11-03 | 9 audits + 3 reviews; fixes in #506–#516; Needt page "Launch sweep 2026-11-03" |
