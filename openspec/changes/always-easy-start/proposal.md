## Why

Owner request, 22.11.2026: every open task should always have an easy first step. Tasks Needt creates or reworks automatically should be light, so the person never opens a task and meets a wall. The task model already has an `entry` (the first small step) and `TaskPart` subtasks, and every AI path already shares their shape. What is missing is a rule that makes sure they exist, and that a task that keeps slipping is made smaller instead of being pushed again.

## What Changes

- **On create.** A task created without an `entry` gets an AI-written entry step (15 minutes or less) and up to 3 subtasks.
- **Existing tasks.** Open tasks with no entry get one once, in small batches by a background job.
- **Stuck tasks.** A task given a later day once (by anyone: the person, an agent, the scheduler), or not started 2 days after it was due to start, is split again: a smaller entry and a simpler title. A periodic worker job does this.
- **Overloaded day.** More than 6 open tasks on one day in a workspace: the overflow (auto-scheduled tasks only) moves to the following days through the existing spread (`task.spread`, `src/services/scheduling/spread.ts`), held there by the scheduler's not-before date. No new placement logic.
- **Setting.** `UserSettings.easyStartMode` (`auto` default, `suggest`, `off`) and `UserSettings.easyStartExcludedProjectIds`. Readable and writable through `GET/PATCH /api/user-settings`. In `suggest` mode a proposal is stored (`EasyStartProposal`) and the person applies it from the one-line notice.
- **Kill switch.** Server flag `always_easy_start`, turned on for everyone by a data migration. It only exists to stop the feature without a deploy.
- **Undo.** Every automatic change is an `AgentAction` with a before snapshot and an inverse (new op `task.simplify`; `task.spread` for the overflow). The person sees one line, "Simplified: ...", with Undo, and can read and undo the history through `GET /api/agent/actions` and `POST /api/agent/actions/:id/undo`.
- **Metering.** Each AI generation goes through the hosted AI claim (`getPreparedSchedulerAI`), so it counts as one action against the plan. Free without its own key gets no AI here: always the fixed entry, nothing claimed. Free with its own key gets the AI step. Out of quota, or no AI available: a fixed fallback entry, no error. A claim that ends as a fallback, or in a failed write, is released.

No new screens and no new visual components: the one-line notice uses the existing `notify` facade, and the settings are two rows in the existing Tasks settings group. The task row does not change; API task views return `entry` next to `title`.

## Impact

- Affected specs: new capability `easy-start`.
- Affected code: `prisma/schema.prisma` (additive: `UserSettings.easyStartMode`, `UserSettings.easyStartExcludedProjectIds`, `Task.rescheduleCount`, `Task.simplifiedAt`, model `EasyStartProposal`), `src/services/easy-start/`, `src/services/ops/ops/tasks.ts` (`task.simplify`, `task.restore` extras, `task.spread` `afterDay` and `notBefore`, later-day counting in `task.update` and `task.move_to_day`), `src/app/api/tasks/[id]/route.ts`, `src/app/api/easy-start/`, `src/services/scheduling/TaskSchedulingService.ts` (reschedule counter), `src/worker/index.ts`, `src/lib/queue/*`, `src/lib/realtime/*`, `src/hooks/useRealtimeSync.ts`, settings rows.
