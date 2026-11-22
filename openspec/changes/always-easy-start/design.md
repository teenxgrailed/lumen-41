## Context

Reused, not rebuilt:

- **AI path.** `getConfiguredSchedulerAI` + `getPreparedSchedulerAI` (`src/services/ai/settings.ts`). Preparing the hosted client claims one action from the monthly allowance (`claimHostedAiAction`); when the allowance is spent the prepared source is `none`. Own-key (BYOK) is not metered.
- **Entry and subtasks.** `Task.entry`, `TaskPart`, `SUBTASK_GUIDANCE` and the shared schemas in `src/services/tasks/subtasks.ts`.
- **Undo.** `runOp` writes an `AgentAction` with an inverse in the same transaction; `POST /api/agent/actions/:id/undo` runs it; `GET /api/agent/actions` is the history.
- **Placement.** `task.spread` over `spreadAcrossDays` / `loadSpreadDays`.
- **Notice.** `notify` facade; a server event reaches the open app over the existing realtime stream, the way `focus-ended` does.

## Decisions

1. **Work happens in the worker, not the request.** Creating a task never waits for an AI call. A create enqueues `easy-start-create`; the worker writes the entry. A periodic `easy-start-sweep` handles stuck tasks and overloaded days. Redis not configured: nothing runs (same as every other queue).
2. **One op for the rewrite: `task.simplify`.** It sets `entry`, optionally `title`, and appends subtasks, in one transaction. Its inverse is `task.restore` with the old `title`/`entry` and `removePartIds` (new optional field). Undo conflicts follow the existing rule: if the person edited the task afterwards, undo refuses with 409 and nothing is overwritten.
3. **Reschedule counter.** Nothing counted moves before. `Task.rescheduleCount` is incremented when the scheduler gives a task a different calendar day than it had (same-day jitter is not a reschedule). `previousScheduledStart` is written at the same time (it already backs `movedFrom`).
4. **Stuck rule.** Open (`todo`), not someday, not recurring or habit, no done subtask, and either `rescheduleCount >= 2` or its start (`startDate`, else `scheduledStart`) is 3 or more days in the past. After a rewrite `simplifiedAt` is set and `rescheduleCount` reset; no new rewrite for 7 days. An undone rewrite is therefore not redone.
5. **Overload rule.** Count open tasks per local day (`taskDayInZone`). Above 6, the lowest-priority ones beyond the 6th that are auto-scheduled and not pinned, locked, frozen or hard-deadline go to `task.spread` with a new `afterDay` input so they land on later days only. If the person undid an automatic spread in the last 24 hours, that person is skipped.
6. **Fallback.** `fallbackEntry()` returns "Open it and do the first 10 minutes." with no subtasks. It is used when AI is unavailable, out of quota, or the answer cannot be parsed. A create-time fallback is still recorded as a `task.simplify` action, so it can be undone like the AI one.
7. **Setting is a typed column**, not a prefs key, because the worker reads it. Default `true`; the column default covers existing rows, so the migration backfills nothing.
8. **Kill switch.** Flag `always_easy_start`. A data migration turns it on at 100%; no gradual rollout. Every entry point checks flag and setting and returns without side effects when either is off.

## Risks

- A wrong rewrite of a title. Mitigation: undo, 7-day cooldown, only stuck tasks.
- AI cost. Mitigation: metered through the existing claim; a per-run cap on AI calls in the sweep.
