## Why

Owner request, 22.11.2026: every open task should always have an easy first step. Tasks Needt creates or reworks automatically should be light, so the person never opens a task and meets a wall. The task model already has an `entry` (the first small step) and `TaskPart` subtasks, and every AI path already shares their shape. What is missing is a rule that makes sure they exist, and that a task that keeps slipping is made smaller instead of being pushed again.

## What Changes

- **On create.** A task created without an `entry` gets an AI-written entry step (15 minutes or less) and up to 3 subtasks.
- **Stuck tasks.** A task moved to another day once or more, or not started 2 days after it was due to start, is split again: a smaller entry and a simpler title. A periodic worker job does this.
- **Overloaded day.** More than 6 open tasks on one day: the overflow (auto-scheduled tasks only) moves to the following days through the existing spread (`task.spread`, `src/services/scheduling/spread.ts`). No new placement logic.
- **Setting.** `UserSettings.alwaysEasyStart` (boolean, on for everyone, existing rows included) is the person's switch. Readable and writable through `GET/PATCH /api/user-settings`.
- **Kill switch.** Server flag `always_easy_start`, turned on for everyone by a data migration. It only exists to stop the feature without a deploy.
- **Undo.** Every automatic change is an `AgentAction` with a before snapshot and an inverse (new op `task.simplify`; `task.spread` for the overflow). The person sees one line, "Simplified: ...", with Undo, and can read and undo the history through `GET /api/agent/actions` and `POST /api/agent/actions/:id/undo`.
- **Metering.** Each AI generation goes through the hosted AI claim (`getPreparedSchedulerAI`), so it counts as one action against the plan. Free gets no AI here: always the fixed entry, nothing claimed. Out of quota, or no AI available: a fixed fallback entry, no error.

No new screens and no new visual components: the one-line notice uses the existing `notify` facade, and the setting is one row in the existing Tasks settings group.

## Impact

- Affected specs: new capability `easy-start`.
- Affected code: `prisma/schema.prisma` (additive: `UserSettings.alwaysEasyStart`, `Task.rescheduleCount`, `Task.simplifiedAt`), `src/services/easy-start/`, `src/services/ops/ops/tasks.ts` (`task.simplify`, `task.restore` extras, `task.spread` `afterDay`), `src/services/scheduling/TaskSchedulingService.ts` (reschedule counter), `src/worker/index.ts`, `src/lib/queue/*`, `src/lib/realtime/*`, `src/hooks/useRealtimeSync.ts`, settings rows.
