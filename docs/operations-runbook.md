# Needt operations runbook

## Coolify schedules

Configure HTTP callers with a timeout above the endpoint's internal budget:

```text
*/15 * * * * curl --fail --max-time 60 -H "x-cron-secret: $CRON_SECRET" https://needt.example/api/cron/sync-calendars
*/30 * * * * curl --fail --max-time 60 -H "x-cron-secret: $CRON_SECRET" https://needt.example/api/cron/reschedule
17 3 * * * curl --fail --max-time 60 -H "x-cron-secret: $CRON_SECRET" -X POST https://needt.example/api/logs/cleanup
```

The reschedule endpoint has a 45-second application budget, persists its
pending batch before enqueueing work, processes at most 50 users, and resumes
on the next invocation. Per-user `cronWindow:userId` deduplication makes an
interrupted batch safe to replay.

## Backups and restore drill

Configure encrypted Coolify/PostgreSQL backups:

- daily, retained for 14 days;
- weekly, retained for 8 weeks.

Quarterly, restore the newest backup into an isolated scratch database. Never
point a running web or worker service at the scratch database.

```bash
createdb needt_restore_drill
pg_restore --clean --if-exists --no-owner --dbname needt_restore_drill backup.dump
DATABASE_URL=postgresql://.../needt_restore_drill npx prisma migrate status
DATABASE_URL=postgresql://.../needt_restore_drill npx prisma validate
psql postgresql://.../needt_restore_drill -c 'select count(*) from "User";'
psql postgresql://.../needt_restore_drill -c 'select count(*) from "Task";'
dropdb needt_restore_drill
```

Record the backup object, restore timestamp, row-count checks, migration
status, operator, and outcome. A backup is not considered verified until this
drill succeeds.

### Verified drills

- Date: 2026-08-10 (pre-release)
- Backup: `needt-prod-backups/data/coolify/backups/databases/root-team-0/postgresql-database-ey10vc8l5lirk6wp7bhld62s-ey10vc8l5lirk6wp7bhld62s/pg-dump-postgres-1786403536.dmp` (326.62 KB in R2 and local storage)
- Restore target: isolated `needt_restore_drill` database; no web or worker pointed at it
- Row counts at backup restore: `User=6`, `Task=36`; live production had the same counts during the drill
- Validation: `pg_restore --exit-on-error` passed and the restored database contained 72 completed Prisma migrations
- Operator: release owner with Codex guidance
- Outcome: passed; scratch database removed

- Date: 2026-08-04 (pre-release)
- Backup: `needt-prod-backups/data/coolify/backups/databases/root-team-0/postgresql-database-ey10vc8l5lirk6wp7bhld62s-ey10vc8l5lirk6wp7bhld62s/pg-dump-postgres-1785807621.dmp` (315.03 KB in R2)
- Restore target: isolated `needt_restore_drill` database; no web or worker pointed at it
- Row counts at backup restore: `User=6`, `Task=30`; live production had `Task=29` during the drill, indicating a post-backup change
- Validation: `prisma migrate status` found 69 migrations and reported the schema up to date; `prisma validate` passed
- Operator: release owner with Codex guidance
- Outcome: passed; scratch database and copied restore artifact removed

## Workspace rollout rollback

The `workspaces` feature flag is seeded disabled with zero-percent rollout.
Enable users through `FeatureFlagOverride` while the migration is evaluated.
To roll back application behavior, disable the flag and remove any enabled
per-user overrides. The additive workspace tables and nullable `workspaceId`
columns stay in place; legacy `userId` reads and writes remain authoritative
while the flag is off. Do not drop or rewrite the workspace migration.

## Scheduling and queue health

`/admin/operations` is admin-only and shows scheduling success by source,
queue waiting/active/failed depth, oldest waiting age, cron cursors, reaper
state, and the last safe error.

Alerts:

- waiting depth >100 or oldest job >2 minutes: warning;
- waiting depth >500 or oldest job >10 minutes: critical;
- cron age >1.5× its interval: critical;
- scheduling run `FAILED`: error.

`RUNNING` scheduling runs older than 15 minutes are failed by the reaper.
Finished runs are retained for 30 days.

## Secrets

All secrets are runtime variables on both web and worker. Do not use Docker
build args for secrets. After any log exposure:

1. generate and install a new `NEXTAUTH_SECRET` (existing sessions expire);
2. create a new Resend key, install it, send a test message, then revoke the
   old key;
3. verify build logs and image history contain neither value;
4. record the rotation without recording secret material.

Required security/delivery variables include `RATE_LIMIT_HASH_SECRET`,
`SENTRY_DSN`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and
`VAPID_SUBJECT`.

`AI_ENCRYPTION_KEY` encrypts every stored credential (AI keys, IMAP
credentials, Google/Outlook OAuth tokens, CalDAV passwords). When it is unset
the key is derived from `NEXTAUTH_SECRET`, so rotating `NEXTAUTH_SECRET` would
make all of them unreadable. Never change `AI_ENCRYPTION_KEY` without a
re-encryption step; web and worker must hold the same value.

## Stored provider credentials

Provider tokens and CalDAV passwords in `ConnectedAccount` and NextAuth
`Account` are stored as `enc:v1:` AES-256-GCM. The worker encrypts any
remaining plaintext rows at every start and logs
`Provider secrets backfill finished` with per-table counts. To re-run it
without a restart, as an admin at needt.app in the browser console:

```js
await fetch("/api/admin/provider-secrets", {
  method: "POST",
  body: JSON.stringify({ direction: "encrypt" }),
}).then((r) => r.json());
```

### Key fingerprint check

Web and worker must derive the same key. In Coolify, open each application
(web and worker) → Terminal (or `docker exec -it <container> sh` on the host)
and run:

```sh
node -e 'const c=require("crypto");const n=process.env.AI_ENCRYPTION_KEY?"AI_ENCRYPTION_KEY":process.env.NEXTAUTH_SECRET?"NEXTAUTH_SECRET":null;if(!n){console.log("NO KEY");process.exit(1)}const k=c.createHash("sha256").update(process.env[n]).digest();console.log(n,c.createHash("sha256").update(k).digest("hex").slice(0,12))'
```

It prints the source variable and a 12-character fingerprint of the derived
key (a hash of the key, safe to paste). Both containers must print the same
line; `NO KEY` means the worker will refuse to start.

### Rollback past the encryption release

Releases before provider-secret encryption send stored values to Google,
Microsoft and CalDAV as they are. Redeploying such an image while rows are
encrypted, or without first stopping the worker, breaks every calendar, mail
and task integration until each user reconnects. In this order:

1. Coolify → worker application → **Stop**. A running worker of the new
   release re-encrypts everything at its next start.
2. As an admin at needt.app, in the browser console (the web app of the new
   release must still be running):

   ```js
   await fetch("/api/admin/provider-secrets", {
     method: "POST",
     body: JSON.stringify({ direction: "decrypt" }),
   }).then((r) => r.json());
   ```

   Check that every table reports `failed: 0`.

3. Redeploy the previous image for web and worker together, then start the
   worker.

## External prerequisites

- Google domain verification: owner — product administrator.
- Microsoft Graph admin consent: owner — Azure tenant administrator.

Realtime Google/Outlook webhooks remain disabled until those external checks
are complete. Polling sync remains the supported fallback.
