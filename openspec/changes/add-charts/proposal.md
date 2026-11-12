## Why

People ask Needt "am I moving?" about a project, a habit or their time, and
today the answer is a ring on a project header and a 14-day habit strip. A
chart block lets a person put that answer where they work — on a project or
on Home — and, like every other object, read and write it from outside
(REST, MCP), so an agent can set up "show me my German streak on Home"
without the UI.

## What Changes

- New `Chart` model (additive migration): place (`projectId`, null = Home),
  `metric` (`task_progress`, `habit_streak`, `time_spent`), optional
  `habitId`, `style` (`line`, `bar`), `rangeDays` (7, 14, 30, 90),
  `position`, soft delete (`archivedAt`).
- Ops `chart.list`, `chart.get`, `chart.create`, `chart.update`,
  `chart.delete` (+ internal `chart.restore`) with undo, the series derived
  on read from tasks, habit completions and time entries in the person's
  time zone.
- REST `/api/charts` and `/api/charts/:id` (session or `needt_` token),
  plus `/api/connect/ops/chart.*`.
- MCP `needt_create_chart`, `needt_update_chart` (`remove: true`), and
  `type: "chart"` on `needt_get` / `needt_list`.
- UI: a charts section under a project's header and a Charts tile on Home's
  rail (switchable in "Show on Home"), drawn as plain SVG in the place's hue.
- Account export, admin reset and the action log's undo cover charts.

## Capabilities

### New Capabilities

- `charts`: chart blocks on projects and Home, their series and their API.

### Modified Capabilities

- none

## Impact

- `prisma/schema.prisma`, `prisma/migrations/20261112210000_charts`
- `src/lib/charts.ts`, `src/services/ops/ops/charts.ts`, ops registry/undo
- `src/app/api/charts/**`, `src/services/connectors/mcp/tools.ts`
- `src/components/needt3/charts/Charts.tsx`, `ProjectPage.tsx`,
  `HomeScreen.tsx`, `src/lib/needt3/home-blocks.ts`
- `src/services/account/account-export.ts`, `scripts/admin/reset-user-data.cjs`
- `docs/connector-api.md`
