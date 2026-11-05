# Tasks

## 1. Data and API (PR 1)

- [x] 1.1 Additive migration: `HabitKind`, `HabitEventType`, `Habit.kind/quitStartedAt/reason`, `HabitEvent`, flag row `habits_quit` off.
- [x] 1.2 `src/lib/habits-quit.ts` with tests (relapse, past start, time zone change, DST, zero events).
- [x] 1.3 Flag `habits_quit`, plan limit `quitHabits`, `quitHabitsEnabled`.
- [x] 1.4 Create and edit accept `kind`, `quitStartedAt`, `reason`; `GET /api/habits` reports `quit`.
- [x] 1.5 Events routes (POST, GET, PATCH) and `quit-summary`; 403 for Free, 404 flag off.
- [x] 1.6 MCP tools `needt_habit_event`, `needt_habit_quit_summary`, hidden with the flag off.
- [x] 1.7 Account export and reset-user-data cover `HabitEvent`; QUIT habits are not scheduled.

## 2. Presence (PR 2)

- [x] 2.1 Additive notification settings fields and per-habit switch.
- [x] 2.2 Pure due-time and dedup logic with tests (quiet hours, time zone, DST, dedup).
- [x] 2.3 Worker sweep jobs: reminder, evening check-in, milestones, re-engage (off by default).
- [x] 2.4 Delivery through `reminder-delivery`, texts in English (the app has no i18n files yet).
