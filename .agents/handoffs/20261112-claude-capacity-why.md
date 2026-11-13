---
id: 20261112-claude-capacity-why
owner: claude
branch: feat/capacity-why
status: active
updated: 2026-11-12T12:00:00Z
objective: Capacity per day, "Why this time?" from the scheduler's inputs, and a what-if preview before a replan
---

## Scope

- Governing plan/spec: docs/plans/06-product-gap-audit.md item 1 (Capacity and schedule explanations).
- In scope: read-only explanation of placement, per-day capacity, preview UI before applying a reschedule.
- Out of scope: any change to placement results; team (multi-person) workload; MCP tools.

## Completed

- See FEATURE.md at the worktree root and the branch commits.

## Working state

- Files currently dirty or expected to change: none after the feature commit.
- Foreign changes that must remain untouched: `.brief.md` (task brief, untracked).

## Verification

- Passed: type-check, eslint on changed files, scheduler/preview/new unit tests, full `npm run test:unit` (see FEATURE.md).
- Not run / still required: e2e against a running app.

## Decisions and constraints

- Product freeze until 17.11.2026: branch only, never main or prod.
- The engine gets an optional `trace` map; a traced run places exactly what an untraced one does (tested).

## Blockers

- None.

## Next action

- Owner review of FEATURE.md open questions, then a PR after the launch freeze.
