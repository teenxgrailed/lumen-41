---
id: 20261019-claude-home-ha-port
owner: claude-home-ha
branch: feat/home-ha-wire
status: active
updated: 2026-10-19T00:00:00Z
objective: Port the new Home design (needt-app/additions/home) 1:1 in three stages - (a) data and API, (b) phone Home pieces, (c) desktop Home
---

## Scope

- Design source (read-only): `Needt - Design : App, Landing/needt-app/additions/` README, home/ha-home.jsx, ha-home.css, _shared/glyphs.js.
- Stage (a): week focus model and API, highlight suggestions through the hosted AI path, the morning-brief window, leave-by removed.
- Stage (b): ha components under `src/components/needt3/home/ha/`, phone Home order.
- Stage (c): the desktop Home grid.
- Out of scope: dock and Settings icons (another agent), the starter game, spec.css and every Spec / Pair / Proto / Frame function.

## Completed

- Stage (d): HaAllDone, HaEndDay, HaTimeline/HaBand and HaReview replace FinishCard, Shutdown, the Home personal rows and ReviewSheet (phone and desktop); review focuses are picked from open tasks and projects and stored as references; PersonalBand stays for the Calendar.
- Stage (c): desktop Home grid (Highlight in the Next up slot, Today + time left and Habits on the right, This week above the schedule, weather beside the date, one-line brief); BriefCard, HighlightCard, HighlightSuggest, TimeLeftBar, DayLine, ProgressCard, NextUpCard, StreakCard, HabitsCard and their CSS removed.
- Stage (b): `home/ha/` components (habits, brief, Highlight, weather, time left, plus all done, End day, week and stats, personal timeline, review as unwired pieces), `ha-home.css`, phone Home order. HabitsStrip, habit dots and the old plate removed from the phone.
- Stage (a): `WeekFocus` model (additive migration), `/api/week-focus` GET/PUT, `/api/ai/highlight-suggestions`, brief window (until 11:00 or the first task done), "From yesterday" note reader, leave-by removed from the day line.

## Working state

- Branch `feat/home-ha-desktop` (stage c), on top of `feat/home-ha-phone` and `feat/home-ha-data`. Pieces 4, 5, 6, 8, 10 are built but not wired: the app already has its own End day, All done, Stats, personal bands and Review.

## Verification

- type-check, lint, touched jest suites, check:ui-contracts, check:worker-bundle; screenshots under the session scratchpad `home-port/shots`.

## Decisions and constraints

- Reuse existing data (Habit.icon, PersonalBlock, DailyHighlight, MorningBrief, End day note, weekly review, `/api/stats`, `/api/weather`).
- The review still takes three free-text focuses; they are saved as titles (no `taskId`) and matched to open tasks by title.

## Blockers

- None.

## Next action

- Stage (d) PR open, no auto-merge (release batches running).
