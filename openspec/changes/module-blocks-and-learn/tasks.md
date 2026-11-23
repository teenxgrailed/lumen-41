# Tasks

Nothing below starts before 17.11.2026. Every phase merges with `learn_module` off. Paths are proposals; confirm against the tree at the start of each phase.

## 0. Schema and registry

- [ ] 0.1 Add `LEARN_MODULE = "learn_module"` to `src/lib/feature-flags-keys.ts` and its description to the admin list.
- [ ] 0.2 Additive Prisma migration: `Module`, `ModuleVersion`, `ModuleRecord` in `prisma/schema.prisma`.
- [ ] 0.3 `src/lib/modules/schema.ts`: Zod for the module document and the flat spec.
- [ ] 0.4 `src/lib/modules/registry.ts`: block entries (props schema, allowedActions, requiredScopes); `voice` registered as disabled.
- [ ] 0.5 `src/lib/modules/validate.ts`: three passes with structured errors; tests for each error code in the spec.
- [ ] 0.6 `src/lib/modules/query.ts`: dataSource to Prisma, viewer forced into `where`; tests for another viewer and for `invalid_query`.
- [ ] 0.7 `src/lib/modules/patch.ts`: JSON-Patch with `baseVersion`, version rows, undo; 409 test.
- [ ] 0.8 `src/lib/modules/catalog.ts`: JSON Schemas and the model prompt from the registry.

## 1. Learn data and FSRS

- [ ] 1.1 Additive migration: `LearnCourse`, `LearnLesson`, `LearnCard`, `LearnReview`, `LearnAttempt`.
- [ ] 1.2 `npm i ts-fsrs@6.0.0 --legacy-peer-deps`; `src/lib/learn/fsrs.ts` wrapper with tests (due ordering, re-queue of mistakes).
- [ ] 1.3 `src/lib/learn/lesson-schema.ts`: Zod for lesson JSON, exercise types `choice`, `type`, reserved `voice`.
- [ ] 1.4 `src/lib/learn/check-answer.ts`: normalised compare against accepted variants; tests.
- [ ] 1.5 `src/lib/learn/generate.ts`: lesson generation with the 3-pass validation and retry; one `AiUsage` action per lesson.
- [ ] 1.6 Curated starter decks EN, DE, ES, FR, UK as seed JSON under `src/lib/learn/decks/`.
- [ ] 1.7 Import from a "Needt · Learn · <topic>" page (read-only) in `src/lib/learn/import-page.ts`.

## 2. Lesson UI and Coo

- [ ] 2.1 `src/app/(app)/learn/page.tsx` and `src/components/needt3/learn/LearnScreen.tsx`.
- [ ] 2.2 Intro screen: mascot over card fan, reward line, level and XP facts, big start button (no solid accent).
- [ ] 2.3 `flashcardStack` block: front card plus visible stack, outline-tinted active state.
- [ ] 2.4 `exercise` block: choice and type inputs, no `voice` UI.
- [ ] 2.5 Progress bar, timer, XP count-up, rise-and-settle motion with 55ms stagger.
- [ ] 2.6 `mascot` block with the ten states and the static SVG fallback poses.
- [ ] 2.7 Coo reaction rules (`think` at 5 s, `combo` x3 and x5, `tease`) as a pure function with tests.
- [ ] 2.8 `lessonSummary` block.
- [ ] 2.9 Rive state machine hook, loaded only when the `.riv` exists (decisions b and c).
- [ ] 2.10 Mistakes review screen.

## 3. Recording mode

- [ ] 3.1 `?record=1` and Settings toggle; 9:16 canvas with safe zones.
- [ ] 3.2 Suppress chrome, paywall, toasts and banners in record mode.
- [ ] 3.3 Fast auto-advance and the XP count-up at 60 fps target.
- [ ] 3.4 Deterministic demo seed (right, right, right, wrong, tease, combo, level-up); test that two runs are identical.
- [ ] 3.5 Toggles: Coo size, sound.

## 4. Calendar, streak and limits

- [ ] 4.1 Course creates one `Habit` (BUILD, `at`, `daysOfWeek`); confirm exemption from `PLAN_LIMITS.habits` in `src/lib/entitlements.ts`.
- [ ] 4.2 Write `HabitCompletion` when the daily goal is met; streak through `streak()` in `src/lib/needt3/derive.ts`.
- [ ] 4.3 Streak freeze storage and consumption (counts per decision d).
- [ ] 4.4 Verify the scheduler places the lesson slot (`src/services/scheduling/`); test with weekday 18:00.
- [ ] 4.5 `learnLessonsPerDay` in `src/lib/plan-limits.ts` (Free 1, Pro unlimited) and `canStartLesson` in `src/lib/entitlements.ts`.
- [ ] 4.6 Free lesson source per decision a (cache pool or allowance).
- [ ] 4.7 Reminders and the `nag` push through `notify` (`src/lib/notifications.ts`).
- [ ] 4.8 Umami events: started, completed, day1, day7, streak_7 (`src/lib/umami-server.ts`).

## 5. Menu, promo, flag

- [ ] 5.1 Pure `learnNavItem` / `learnView` and `GET /api/learn/nav` with tests (follow the Budget pattern, do not edit its files).
- [ ] 5.2 Desktop sidebar row after Agents; phone menu row before Settings; Free grey with PRO pill.
- [ ] 5.3 Settings -> General switch `prefs.learnInSidebar` (Pro only).
- [ ] 5.4 Promo reusing `cn-promo*`, Pro buttons hidden in store builds, seen flag in `UserSettings.prefs`.
- [ ] 5.5 Changelog fragment under `[unreleased]` at rollout time, not before.

## 6. MCP and API

- [ ] 6.1 `src/services/connectors/mcp/module-tools.ts`: `module_list`, `module_get`, `module_validate`, `block_list`, `block_get_data`, `block_invoke_action`; register in `tools.ts`.
- [ ] 6.2 Write tools `module_create`, `module_update`, `module_delete` answering `modules_write_disabled` outside the internal Learn module.
- [ ] 6.3 `ui://needt/module/{id}` resource on the `add-mcp-app-widgets` hosting; text + JSON fallback.
- [ ] 6.4 REST mirror `src/app/api/connect/modules/*`; document in `docs/connector-api.md`.
- [ ] 6.5 Scope `modules:write`; activity-log entries for agent writes; test insufficient scope.

## 7. Verification

- [ ] 7.1 `npm run type-check`, `npm run lint`, `npm run test:unit`, `npm run build`.
- [ ] 7.2 Screenshots of Learn (intro, question, wrong, combo, summary, promo, record mode) at 390, 1280, 1440 px, light and dark; attach to the PR.
- [ ] 7.3 Recording check on a real phone: demo seed take, 60 fps, no chrome.
- [ ] 7.4 Design-rule check against `docs/handoff/PORT.md` §0 and §6 (13/12px, one grey ladder, no solid accent button).
- [ ] 7.5 Review agent (`reviewer`) with H/M/L marks; fix H and M before merge, second pass on the fix commit.
- [ ] 7.6 Merge with flag off; owner turns it on in production.
