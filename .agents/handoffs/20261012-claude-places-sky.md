---
id: 20261012-claude-places-sky
owner: claude-places-sky
branch: fix/places-sky
status: active
updated: 2026-10-12T17:00:00Z
objective: Desktop Templates, Shared, Trash, Habits and Moodboards match their prototype treatment (sky banner, collage covers, Free lines, Last four months)
---

## Scope

- Governing plan/spec: docs/port/prototype/places.jsx, Habits.jsx, SCREENS.md (Moodboards, Habits, Templates, Shared, Trash); PORT.md.
- In scope: src/components/needt3/places/**, src/components/needt3/habits/**, the Moodboards list API (preview), a Habits history route, the sky engine's theme read.
- Out of scope: src/components/needt3/connections/** (another worker), src/components/needt3/docs/** and the pages list API, Mailbox header, Settings sections, src/styles/v3/**, src/components/needt/**.

## Completed

- Audit with screenshots (prototype vs port, populated / empty / loading / error, light + dark, 1440 and 1024).
- Templates, Shared: PlSceneHeader (PxSky banner + glass prints).
- Moodboards: PlCollage covers, reference count, ProLimit line, ProUpsell; list API sends itemCount + preview.
- Habits: ProLimit header, "Last four months" (HabitMonths) over GET /api/habits/history.
- sceneIsDark: the sky reads the nearest data-theme.

## Working state

- Files expected to change: none after the PR is open.
- Foreign changes that must remain untouched: connections/**, docs/**, mailbox, settings.

## Verification

- Passed: tsc, `npm run lint` (0 warnings), `test:unit --runInBand` with CI=true TZ=UTC and plain, tokens:check, check:ui-contracts, next build.
- Evidence: `.agents/handoffs/evidence/places-sky/` (before / after, prototype vs port, one dark pair).
- Not run: Playwright e2e (needs the DB).

## Decisions and constraints

- Moodboard covers come from the list route (one query, first three items per board), not one items request per board.
- Templates have no look of their own in the API, so their prints and cards are plain pages; Shared pages bring their real backdrop.
- Trash still lists tasks and moodboards only; GET /api/pages?trashed=true and page restore now exist (a5c4c64a), so Pages can be added to Trash on both faces.

## Blockers

- None.

## Next action

- Review the PR; follow-up: Pages in Trash (desktop + phone), owner name on Shared ("From Lena"), board members / lock on Moodboard cards.
