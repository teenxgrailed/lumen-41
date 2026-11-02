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
| Legal operator decided | Owner | unverified | | |
| Creem review approved, 3 products live | Owner | unverified | | rejected 2026-10-01 for placeholder legal pages |
| Pricing page shows $7 / $59 / $149 | Claude | ok | 2026-11-02 | all three present |
| Sign-ups flag on | Claude | ok | 2026-11-02 | `{"enabled":true}` |
| Checkout flag follows Creem | Owner | unverified | | |
| Worker alive | Claude | ok | 2026-11-02 | `workerBuildSha` present |
| Resend delivers | Owner | unverified | | |
| Sentry events and alerts | Owner | unverified | | |
| Backups daily, 30 days | Owner | ok | 2026-11-02 | daily to S3, last success 00:00 UTC, 14 kept locally (checked by Claude via Coolify) |
| AI action cap set | Owner | ok | 2026-11-02 | `NEEDT_AI_MONTHLY_ACTION_CAP` present on `needt` (value not readable; checked by Claude via Coolify) |
| Free disk ≥ 1 GB after fan-out | Claude | ok | 2026-11-02 | 4.7 GB free |
