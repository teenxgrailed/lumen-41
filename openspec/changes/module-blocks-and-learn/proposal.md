## Why

Two owner decisions of 14.11.2026 meet in one change.

1. Needt is a place a person aims at their own problem, not a fixed set of screens. The general form of that is a **module**: a small screen the AI assembles for one person from Needt's own prebuilt blocks over Needt's own data. Not arbitrary generated code (base44's problem, and ours to avoid), and reachable from outside through MCP, the public API and Connectors, like everything else in Needt.
2. **Learn** is the first module on that system: learn any language with AI, Duolingo-like mechanics in Needt's design system, taught by the pigeon Lil Coo (from the Needt videos). It has to look spectacular when screen-recorded on a phone, because that is also a content channel.

Research page: Needt page "Learn + Blocks · research" (14.11.26). Reference: the owner's Duolingo "card cascade" screenshots (mechanics and feel only, no art or branding).

## What Changes

- **Block registry** (`src/lib/modules/`): the only things a module can contain: `list`, `table`, `cards`, `chart`, `form`, `timer`, `chat`, `calendarSlot`, plus Learn's domain blocks `flashcardStack`, `exercise`, `lessonSummary`, `mascot` and a reserved `voice` slot. Each has a Zod props schema, allowed actions and required scopes.
- **Module JSON** (`needt.module`, flat `{root, elements}` spec in the json-render shape) with typed custom collections. `dataSource` is a structured query compiled server-side to Prisma under the viewer's scopes; no raw SQL.
- **AI assembly** validated in three passes (schema, references, scopes and limits) with at most two structured retries; nothing is stored until valid. Edits are JSON-Patch against `version`; versions are kept, so every edit is undoable.
- **MCP, public REST and Connectors** expose the same operations (`module_*`, `block_*` tools). Rendering in MCP clients through MCP Apps, with a text + JSON fallback.
- **Learn module** behind `learn_module` (off for all): any language through AI, lessons of text-typed and multiple-choice exercises, FSRS review scheduling, XP and a daily goal kept apart from the streak, one streak freeze, mistakes review, Coo with reaction states, a clean 9:16 recording mode with a deterministic demo take.
- Lessons are placed in the calendar by the scheduler; the streak is a Needt habit.
- Learn is Pro; Free gets one lesson a day. Left-menu row plus promo like Agents, Connectors and Budget (#690): Free sees a grey row with a PRO pill and a promo that reuses `cn-promo*`; Pro sees a normal row that Settings can hide.
- `voice` exercises (speaking practice) are paused: only the type name and a schema slot are reserved.
- Learn imports from, or at least does not collide with, the existing "Needt · Learn · <topic>" pages written by the `/needt:learn` skill.

## Out of scope

- Arbitrary code or HTML generation, user-uploaded components, third-party blocks.
- Voice exercises, leagues, hearts or energy (explicitly excluded: no paywall on practice inside a lesson).
- User-built modules in the UI in v1 (design.md, open decision g; recommendation: v2).
- Any change to files of PR #690 (Budget). Only its pattern is reused.

## Capabilities

### New Capabilities

- `module-blocks`: registry, module JSON, data sources, validation, versions, permissions, MCP and public API.
- `learn-module`: the Learn product: data, lessons, scheduling, Coo, recording mode, streak, limits, menu and promo.

### Modified Capabilities

- None in this change; implementation touches navigation, feature flags and the MCP tool list (tasks.md).

## Impact

- Prisma: new tables (`Module`, `ModuleVersion`, `ModuleRecord`, `LearnCourse`, `LearnLesson`, `LearnCard`, `LearnReview`, `LearnAttempt`), additive migration only.
- New `src/lib/modules/`, `src/lib/learn/`, `src/app/(app)/learn/`, `src/app/api/modules/`, `src/app/api/learn/`, MCP tools in `src/services/connectors/mcp/`.
- New dependencies: `ts-fsrs` 6.0.0 (MIT); `@rive-app/react-webgl2` 4.39.0 (MIT) only if the owner picks Rive.
- New flag `learn_module` in `src/lib/feature-flags-keys.ts`.

## Rollout

Docs only now; merge freeze until 17.11.2026 (Product Hunt). Implementation starts after 17.11 and merges with `learn_module` off for everybody; the owner turns it on in production. Screenshots at 390, 1280 and 1440 px, light and dark, plus a review agent are required before each merge.
