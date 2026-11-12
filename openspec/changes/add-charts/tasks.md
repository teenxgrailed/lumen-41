# Tasks

## 1. Data and API

- [x] 1.1 Additive migration: `Chart` table with indexes and foreign keys.
- [x] 1.2 Pure series and geometry (`src/lib/charts.ts`) with unit tests.
- [x] 1.3 Ops `chart.*` with undo; `chart` in the action log's touched models.
- [x] 1.4 REST `/api/charts`, `/api/charts/:id`; route tests.
- [x] 1.5 MCP `needt_create_chart`, `needt_update_chart`, `type: "chart"` on get/list; MCP tests.
- [x] 1.6 Account export and admin reset cover `Chart`.

## 2. UI

- [x] 2.1 Chart card (SVG line / bars, caption, range and style menu, remove with Undo).
- [x] 2.2 Charts section under a project's header with "Add chart".
- [x] 2.3 Charts tile on Home's rail, switchable in "Show on Home".
- [x] 2.4 Playwright spec `tests/charts.spec.ts` with screenshots.

## 3. Later

- [ ] 3.1 "Any field over time" (a custom property or a database column).
- [ ] 3.2 Phone Home and the phone project page.
- [ ] 3.3 Drag to reorder charts in the UI (the API takes `position`).
- [ ] 3.4 A feature flag or plan gate, if the owner wants one before release.
