---
id: 20261112-claude-roadmap-view
owner: claude
branch: feat/roadmap-view
status: active
updated: 2026-11-12T21:40:00Z
objective: Roadmap view (metro map of a project's tasks) for Projects and Agents, on existing data, no schema change
---

## Scope

- Governing plan/spec: Needt task cmw51xbf006bms301huz782g7 "Roadmap view for projects and agents"; state rules from the needt:plan skill (§3, board.md).
- In scope: pure engine `src/lib/needt3/roadmap.ts`; `RoadmapMap` / `RoadmapScreen` (`/projects/[id]/roadmap`); Agents → Roadmap tab; entry points (project page button on desktop and phone, sidebar project menu).
- Out of scope: editing the roadmap from Agents Chat (button only switches to Chat), plan page log, new schema, merge to main (product freeze until 17.11.2026).

## Completed

- See `git log origin/main..feat/roadmap-view` and FEATURE.md at the worktree root.

## Working state

- Files currently dirty or expected to change: none after the final commit.
- Foreign changes that must remain untouched: `.brief.md` (untracked, from the launcher).

## Verification

- Passed: `npm run type-check`, eslint on touched files, jest for roadmap engine/map/agents data and the agents, work, shell and phone/tasks suites; local browser check against Docker Postgres (screenshots in `docs/screens/roadmap/`).
- Not run / still required: Playwright e2e/visual suites (`visual-style` baselines will change only if they cover these screens), review by the design lane.

## Decisions and constraints

- Milestones = every non-repeating, non-binned task of the project; no "milestone" flag exists, and the skill's boards are exactly that.
- Vertical metro on both faces; fixed 56px rows keep the SVG track and the HTML rows aligned.
- Do not merge before the 17.11.2026 launch.

## Blockers

- None.

## Next action

- Owner reviews FEATURE.md open questions; after 17.11 open a PR from feat/roadmap-view.
