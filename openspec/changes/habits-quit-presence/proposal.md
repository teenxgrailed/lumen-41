## Why

Habits today only build: tick a day, keep a streak. People also want to stop doing something, and a habit that never speaks up is easy to forget. Both are general mechanisms, not one topic: a QUIT habit can be any thing the person stops (sugar, doomscrolling, smoking), and presence is any habit reaching the person at the right time.

## What Changes

Everything is behind the server-side feature flag `habits_quit` (default off). QUIT habits are Pro (a trial counts as Pro). No UI in this change; it is ported later from the design handoff.

PR 1, data and API:
- `Habit.kind` (`BUILD` default, `QUIT`), `Habit.quitStartedAt`, `Habit.reason`, and a new `HabitEvent` table (`URGE`, `RESISTED`, `RELAPSE`, `MILESTONE`) with tag, intensity 1 to 5 and note.
- Pure maths in `src/lib/habits-quit.ts`: current and best streak, clean days, next milestone (1, 3, 7, 14, 30, 90, 365), urge distribution by hour and weekday in the person's time zone. A relapse restarts the streak; the streak is derived from the log, never stored.
- REST: create and edit accept `kind`, `quitStartedAt`, `reason`; `POST/GET /api/habits/:id/events`, `PATCH /api/habits/:id/events/:eventId`, `GET /api/habits/:id/quit-summary`; `GET /api/habits` reports `quit: on | upgrade | off`.
- MCP: `needt_habit_event` and `needt_habit_quit_summary`, listed only with the flag on.

PR 2, presence (BullMQ jobs): reminder at the habit's `at` time, evening check-in, QUIT milestones, soft re-engage after 3 days without a check-in (off by default), quiet hours, per-habit and global switches, at most one push of a kind per habit per day.

## Capabilities

### New Capabilities
- `habits-quit`: QUIT habits, events, summary, gate.
- `habits-presence`: habit push reminders.

### Modified Capabilities
<!-- None. -->

## Impact

- Code: `prisma/schema.prisma` and one additive migration, `src/lib/habits-quit.ts`, `src/services/habits/quit-service.ts`, `src/app/api/habits/*`, `src/services/connectors/mcp/tools.ts`, `src/lib/feature-flags*.ts`, `src/lib/plan-limits.ts`; PR 2 adds worker jobs and notification settings fields.
- A QUIT habit never gets scheduled weekly blocks.
- Account export includes habit events; reset-user-data deletes them.
