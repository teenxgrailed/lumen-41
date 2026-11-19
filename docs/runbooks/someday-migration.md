# Someday launch migration (runbook)

Moves every open task untouched for 14 days to Someday, with the same rules as
the nightly sweep (`scanSomedayCandidates` in `src/services/day-plan/someday.ts`).
`someday_sweep` stays off; this is a separate, one-time step.

On top of the sweep's rules the migration (dry run and apply alike) also keeps
out: tasks the person pinned (`scheduleLocked`) or froze (`isFrozen`), tasks
scheduled in the future (`scheduledStart` after now), and people for whom
`day_plan` (the kill switch) is off. It scans every row, with no page cap.

The script ships in the production web image as `scripts/someday-migration.cjs`
(bundled from `scripts/someday-migration.ts` by `npm run build:scripts`, built in
the web builder stage only). It uses its own Prisma client with `log: []`, and
nothing identifying (id, title, email, SQL) reaches stdout or stderr; an error
prints only its name and code.

## Dry run (safe, no yes needed)

Coolify, the app resource, one-off command:

```bash
node scripts/someday-migration.cjs --dry-run
```

Read-only: the database enforces it (`SET TRANSACTION READ ONLY` is the first
statement), with `lock_timeout` 5 s and `statement_timeout` 120 s, and a
5-minute transaction limit. It prints one JSON line and one summary line: tasks
and users that would move, users by task count (1, 2-5, 6-20, 21-100, 100+), the
largest per-user count, and how many tasks each protection rule kept out
(including `pinned` and `future_scheduled`). `wouldMove` is what `--apply` moves
under the same flags. If a page cap was hit, the JSON carries `"truncated":true`
and the exit code is 3: do not trust the numbers.

## Real run (needs the owner's yes)

```bash
node scripts/someday-migration.cjs --apply --backup-id <id> [--backup-date YYYY-MM-DD] [--batch-size 200]
```

Do not run it without the owner's yes and a database copy taken the same day.
The script checks that the copy is from today (UTC) and exits 2 otherwise:

- `<id>` must contain today's date as `YYYYMMDD` or `YYYY-MM-DD`, or
- when the Coolify backup name or uuid carries no date, pass
  `--backup-date YYYY-MM-DD` equal to today (UTC) as well.

`--apply` writes one `SomedayMigrationMove` row per task (the `backupId` column
keeps the id you passed, so a batch can be tied to its copy) and records one
`task_to_someday` event per person with reason `migration` and a `count`.
Running it twice moves 0 the second time. A truncated run (page cap) exits 3.

## Undo for a person

`POST /api/someday/migration/restore` ("Return all") restores the tasks of that
person's unrestored move rows that are still in Someday, whatever reason they
carry now: a task the weekly cleanup archived after the migration is unarchived
too. Tasks they parked by hand and never migrated stay. Only the move rows read
at the start are marked restored.
`GET /api/someday/migration` returns `{ moved, restored }` for the screen.
