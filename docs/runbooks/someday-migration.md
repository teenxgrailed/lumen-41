# Someday launch migration (runbook)

Moves every open task untouched for 14 days to Someday, with the same rules as
the nightly sweep (`scanSomedayCandidates` in `src/services/day-plan/someday.ts`).
`someday_sweep` stays off; this is a separate, one-time step.

The script ships in the production image as `scripts/someday-migration.cjs`
(bundled from `scripts/someday-migration.ts` by `npm run build:scripts`).

## Dry run (safe, no yes needed)

Coolify, the app resource, one-off command:

```bash
node scripts/someday-migration.cjs --dry-run
```

Read-only: the database enforces it (`SET TRANSACTION READ ONLY` is the first
statement). It prints one JSON line and one summary line: tasks and users that
would move, users by task count (1, 2-5, 6-20, 21-100, 100+), the largest
per-user count, and how many tasks each protection rule kept out. No titles,
emails or ids.

## Real run (needs the owner's yes)

```bash
node scripts/someday-migration.cjs --apply --backup-id <id> [--batch-size 200]
```

Do not run it without the owner's yes and a database copy taken the same day;
`<id>` is that copy's id. `--apply` refuses to start without `--backup-id`. It
writes one `SomedayMigrationMove` row per task and records `task_to_someday`
events with reason `migration`. Running it twice moves 0 the second time.

## Undo for a person

`POST /api/someday/migration/restore` ("Return all") restores exactly that
person's migrated tasks still in Someday; tasks they parked by hand stay.
`GET /api/someday/migration` returns `{ moved, restored }` for the screen.
