---
id: 20261112-claude-progress-counter
owner: claude
branch: feat/progress-counter
status: done
updated: 2026-11-12T23:30:00Z
objective: Plan 11 T-1 counter, T-2 manual mini-entry trigger, T-4 value-bearing groups, on a feature branch only (product freeze until 17.11.2026)
---

## Scope

- Governing plan/spec: docs/plans/11-task-model.md T-1, T-2, T-4
- In scope: counter from unnamed TaskParts, `PUT/GET /api/tasks/:id/count`, `Task.moveCount`, way-in ask in the task dialog, money pair on rows and project header
- Out of scope: AI-generated mini-entry (blocked by the 20-task prompt gate), sale animation, budget.needt.app link

## Completed

- See FEATURE.md at the worktree root and `git log feat/progress-counter`.

## Working state

- Nothing dirty after the final commit.
- Foreign changes that must remain untouched: none.

## Verification

- Passed: jest (new + needt3 task/work/lib suites), eslint on changed files, type-check, migration on local Docker Postgres.
- Not run: e2e, a visual check in a running app.

## Decisions and constraints

- Must not reach main or prod before 17.11.2026.
- A counter is a task whose parts all have empty titles; no taskType, no counter column.

## Blockers

- None.

## Next action

- Owner reviews FEATURE.md open questions; run the T-2 twenty-task gate before any AI generation.
