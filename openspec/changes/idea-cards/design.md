## Context

Reused, not rebuilt:

- **Task row and ops.** `Task`, `runOp`, `AgentAction` with inverse and `touched` rows, `task.restore`, realtime `publishTasksUpdated`. Undo, history (`GET /api/agent/actions`) and conflict detection come for free.
- **Parking precedent.** Someday (`Task.somedayAt`, `moveTasksToSomeday` in `src/services/day-plan/someday.ts`) already clears a task's schedule and blocks. Ideas reuse that clearing, not the bucket.
- **Background pattern.** Always easy start (`src/services/easy-start/`): pure `rules.ts`, a paged sweep stamped per examined task, AI through `getPreparedSchedulerAI` (metered), one summed notice with Undo, kill-switch flag plus a setting.
- **Placement.** The scheduler places a single task; `spreadAcrossDays` finds the first day with room.

## Decisions

### 1. Model: `Task.kind`, not a separate `Idea` table

Add `enum TaskKind { TASK IDEA }`, `Task.kind TaskKind @default(TASK)`, and idea fields on the same row:

| Field | Meaning |
| --- | --- |
| `ideaSource` (`user`, `converted`, `agent`, later `suggested`) | where it came from |
| `ideaSnoozedUntil` | Skip hides it until this time |
| `ideaLastShownAt` | rotation (oldest first) and the per-day cap |
| `ideaSkipCount` | how many times skipped |
| `ideaCheckedAt` | the detection sweep looked at this task |

Why one row, not a model of its own:

- Take and "convert back" are one field flip. With a separate table Take is copy-and-delete: it loses identity (links, attachments, notes, activity, tags, project) and needs a second undo path.
- Everything the person can already do with a task (project, tags, description, page links, attachments, API, MCP, undo, realtime, export) works on an idea with no new code.
- Conversion in both directions is a normal reversible op with a before snapshot.

The price, stated plainly: every query that means "the person's tasks" must now exclude ideas. This is the main risk (see Risks). Mitigation: one helper `openTaskWhere()` in `src/lib/tasks/` that adds `kind: "TASK"`, used by the scheduler, day plan, easy start, reminders, nudges, digests, overdue reads and the default of `task.list` / `GET /api/tasks`; a test that lists every `prisma.task.find*` call site in the scheduler and notification code and fails when one neither uses the helper nor names `kind`. A DB CHECK constraint (`kind = 'IDEA'` implies `dueDate`, `deadline`, `scheduledStart` null) is a possible later hardening; this change enforces the shape in the ops.

A separate model was weighed for cleanliness of lists and rejected: an idea is the same thing as a task with a lower commitment level, and the owner wants Take to be instant and Skip to be harmless.

An idea is not Someday. Someday is a real task the person parked (still has a place, comes back on Return). An idea was never committed to; it is offered, not owed. They stay separate states: an idea cannot have `somedayAt`, and a Someday task is never auto-converted to an idea.

### 2. Shape of an idea (invariants)

`kind = IDEA` implies: `status` is `todo`; `dueDate`, `deadline`, `startDate`, `scheduledStart`, `scheduledEnd`, `postponedUntil` are null; `hardDeadline` false; `isAutoScheduled` false; `scheduleLocked` false; no `ScheduledBlock`; no `TaskReminder`; not recurring; not a habit occurrence; `somedayAt` null; `isSample` false. The ops enforce it:

- `idea.create` and `task.create` with `kind: "idea"` reject (`BAD_INPUT`) a due date or schedule instead of silently dropping it.
- `task.update` on an idea rejects `dueDate`, `deadline`, scheduling fields and `status: completed` (finish an idea by Take, or by deleting or archiving it). Completing through the API answers a clear error.
- Converting a task to an idea clears all of the above in the same transaction and deletes its blocks and reminders. The old values are in the `before` snapshot, so undo restores the due date and the task fields (blocks are re-created by the scheduler on the next run, as with Someday).

### 3. Ops (each an `AgentAction`, reversible)

| Op | What it does |
| --- | --- |
| `idea.create` | new idea: `title`, optional `description`, `projectId`, `source` |
| `idea.list` | ideas, filter `state` (`ready`, `snoozed`, `all`), paged |
| `idea.convert` | `taskId` + `to: "idea" \| "task"`. `to: "task"` makes a plain unscheduled task (no Take placement) |
| `idea.take` | idea becomes a task and is placed now (decision 7) |
| `idea.skip` | `ideaSnoozedUntil = now + 7 days`, `ideaSkipCount + 1` |
| `idea.cards` (read) | the cards to show for a local day (decision 6), stamps them shown |

`task.list` and `task.get` return `kind`; `task.list` defaults to `kind: "task"` so existing clients and agents never see ideas by surprise, and `kind: "idea"` or `"any"` lists them. `taskView` carries `kind` next to `title` and `entry`. Surfaces for people outside our UI (CLAUDE.md: the data must be reachable):

- REST for the app: `GET/POST /api/ideas`, `PATCH /api/ideas/:id`, `POST /api/ideas/:id/take`, `POST /api/ideas/:id/skip`, `POST /api/ideas/:id/convert`, `GET /api/ideas/cards?day=YYYY-MM-DD`.
- Connector for tokens: `/api/connect/ideas` with the same verbs; `docs/connector-api.md` updated.
- MCP: `needt_create_idea`, `needt_list_ideas`, `needt_take_idea`, `needt_skip_idea`; `needt_update_task` accepts `kind` for convert; `needt_list` keeps tasks by default and takes `kind`.
- Undo through the existing `POST /api/agent/actions/:id/undo`.

### 4. Detecting candidates (tasks that are really ideas)

Pure `src/services/ideas/rules.ts`; the base case needs no AI.

A task is a **candidate** when all hold:

- Owned by the person (`userId`), not assigned to someone else, `status` `todo`, not Someday, not archived or in an archived project, not recurring, habit, series or synced, not a sample, no `hardDeadline`, priority not high, not pinned or locked, no done subtask, not in a project the person excluded from easy start.
- The **title matches an optional-activity keyword**, whole word, case-insensitive, EN/RU/UK/DE: read, watch, listen, news, tutorial, explore, browse, look at, check out, try out, podcast, article, video (EN); прочитать, почитать, посмотреть, новости, туториал, изучить, глянуть, подкаст, статья (RU); and UK/DE equivalents. The list is a constant in `rules.ts` and tested. A title that also carries a commitment word (before, by, deadline, submit, send, pay, call, до, сдать, отправить, оплатить) is not a candidate, so "Read contract before Friday" stays a task.
- The task has **no due date, or is overdue by 1 or more days, or has `rescheduleCount >= 1`** (the easy start counter). A future due date is a commitment and is left alone.

Optional AI check (second step, behind the same setting): for a candidate with an ambiguous title (keyword plus a project that holds client work, or a long description) one metered call classifies `idea | task`. It goes through `getPreparedSchedulerAI` like easy start: Free without its own key gets no AI call and an ambiguous candidate is simply not converted; a claim that ends unused is released. AI can only **reject** a rule candidate, never create one, so a missing AI never converts more.

Manual paths, always available: "Make it an idea" on a task and "Make it a task" on an idea, one action each (`idea.convert`), both undoable.

**Automatic conversion** (owner decision 1): the periodic `idea-sweep` job converts candidates that are **overdue 2+ days or have `rescheduleCount >= 1`**. A fresh "Read news" the person just wrote, with no date, stays a task until it slips. Rules:

- Runs only when `ideaCardsEnabled` and the flag are on.
- At most 5 conversions per person per run, 20 per day.
- Every conversion is an `idea.convert` action with a before snapshot (including the old due date), so undo restores it. The person sees one summed line through `notify`, "Moved 3 to Ideas: Read AI agents news ...", with Undo that runs all inverse actions in order; a failed Undo says so.
- A task examined and not converted gets `ideaCheckedAt`, so the scan moves on (the same stamping as easy start decision 5); the stamp is cleared when the title changes. An undone conversion sets `ideaCheckedAt` so the job never converts the same task again.
- Cursor paging by id and a worker-memory account cursor, as in easy start.
- Order with easy start: the idea sweep runs first. A task that becomes an idea leaves easy start's candidate set (it reads `kind: "TASK"`), so it is not rewritten.

### 5. Where ideas come from

Sources: `user` (the person saves one: "save as idea" in quick add, the task menu, API, MCP), `converted` (decision 4), `agent` (an agent or MCP client created it). Later and not in this change: `suggested` ideas from the person's interests (saved topics, memory, ideas they took before). The `ideaSource` column and the card contract already allow it; a suggestion would be created as a normal idea with source `suggested` under the same cap and rotation.

### 6. Placement, frequency, rotation

`idea.cards(day)` is the one read the Today and Home lists use. The server decides; the client only renders.

- **Cap.** At most 2 ideas per local day (the person's zone, the day boundary `taskDayInZone` already uses). The cap counts ideas stamped shown that day, including ones taken or skipped, so skipping does not open a new slot.
- **Selection.** Ideas with `ideaSnoozedUntil` null or past and not archived, ordered by `ideaLastShownAt` ascending with nulls first, then oldest `createdAt`: least recently shown first, never-shown ahead.
- **Stamping.** The read writes nothing (a token with read scope must not use up the day). The screen calls `idea.shown` for a card it actually draws; that stamps `ideaLastShownAt = now` and records `idea_shown`, once per day per idea, refused when 2 other ideas are already stamped today. The read returns the ideas stamped today and fills the remaining slots from the least recently shown in one fixed order, so the result is stable across devices and reloads whether or not the cards were marked yet.
- **Position hint.** The response gives each card an `after` hint: the first after the person's 2nd visible task, the second after the 5th; with fewer tasks, at the end; never the first row; on a day with no tasks, one card. The design chat may move the slots; the cap and rotation are server rules.
- **No cards when**: the setting or flag is off, the person has no ideas, or the screen is the evening review or the day plan list (an idea is not planned).
- **Skip.** `ideaSnoozedUntil = now + 7 days`, `ideaSkipCount + 1`. After the 3rd skip the idea is archived (`isArchived`, reversible, still listed by `idea.list` with `state: all`) so the same card never nags.
- **Take.** Next decision.

### 7. Take

`idea.take`, in one transaction: `kind = TASK`, `ideaSnoozedUntil` null, `status` stays `todo`, `isAutoScheduled = true`, duration is the idea's estimate or 30 minutes. Then the scheduler places that one task now: the first free slot today from the current time; if today has no room (work hours over, or the day-plan limit already reached), the first day with room through `spreadAcrossDays`. It is placed, never given a due date. The op returns the placement. `ideaLastShownAt` is kept for the cap. Easy start then sees an ordinary task with no entry and queues its first step as for any new task. Undo turns it back into an idea with its old snooze and skip fields and removes the placement.

`idea_taken` is recorded with `source` and `skipCount`.

### 8. Exclusions (where `openTaskWhere()` applies)

- **Overdue.** Ideas have no due date, so the overdue reads in Home (`derive.ts`, `finish.ts`, `now.ts`, `HomeV2`, `review.ts`, `brief.ts`), the weekly review, goals standing, calendar blocks and settings derive skip `kind: idea`. API task lists default to tasks only, so a client that does nothing still never shows an idea as overdue.
- **Notifications.** Overdue pushes, the daily digest, proactive nudges, reminders (a `TaskReminder` cannot be created on an idea) and the nudge tip never read ideas.
- **Day plan.** An idea is not counted toward the day limit (`DAY_TASK_LIMIT`, plan D2), cannot be a main task and cannot be in an accepted plan. Take makes it a task that counts like any other.
- **Easy start.** Not counted in the overload cap (6/day), not a create, stuck or backfill candidate, no proposal made for it.
- **Scheduler capacity.** Ideas are never loaded as work to place and never reduce free time.
- **Plan limits.** An idea does not count toward any plan task cap or the sample and onboarding counters.
- **Done and history.** Ideas never count as completed. A taken-then-completed task counts as a normal completed task.

### 9. Setting and kill switch

`UserSettings.ideaCardsEnabled Boolean @default(true)`, read and written through `GET/PATCH /api/user-settings`, one row "Idea cards" in the Tasks settings group (an existing toggle row, no new component). When off: `idea.cards` returns none, the sweep does not convert, no `idea_shown` is recorded; ideas already stored stay and can be listed, taken and skipped through the API. Flag `idea_cards` (key, known flag, helper) is on for everyone by data migration; turning it off stops cards and the sweep without a deploy; a failed settings read counts as off. No gradual rollout (ship to everyone).

### 10. Analytics

Three events in the activation table and Umami through `recordActivation` (props: short ids and kinds only, never the title): `idea_shown` (`source`, `position`), `idea_taken` (`source`, `skipCount`, `placedToday`), `idea_skipped` (`source`, `skipCount`). A shown-vs-taken rate per source tells whether converted ideas and user ideas are worth a card.

### 11. UI

Out of scope. The design chat draws the card (Take / Skip, a quiet "Idea" mark that is not an accent fill, per the CLAUDE.md design rules), its two slots, the empty state, the "Ideas" list and the Undo line. Product code uses the typed `notify` facade for the summed conversion line. This change delivers the contract above so the design can be built on real data.

## Risks

- **A query forgets the filter and an idea shows as a task or as overdue.** Mitigation: the `openTaskWhere()` helper, default `kind` in `task.list`, a call-site test over scheduler and notification code, and the invariant that an idea has no due date or schedule, so most date-based reads cannot return it anyway.
- **Wrong auto-conversion** (a real task becomes an idea). Mitigation: keyword plus overdue 2+ days or moved later, commitment words block, never high priority, 5 per run, undo, the setting, `ideaCheckedAt` so an undone one is not redone.
- **A person loses a task that was real.** Mitigation: nothing is deleted, ideas stay listed, and the conversion line names the tasks.
- **AI cost.** The base rule needs no AI; the optional check is metered like easy start and can only reject.
- **Cards feel like nagging.** Mitigation: cap 2, 7-day snooze, archive after the 3rd skip, the off setting.

## Open owner decisions

1. **Convert existing overdue tasks of this kind automatically?** Recommended: yes, automatic, with the guard rails of decision 4 (keyword, no commitment word, overdue 2+ days or moved later, never high priority, 5 per run, one summed line with Undo). Alternatives: only suggest ("Move 3 to Ideas?"), or manual only. Automatic matches how easy start ships and removes the red overdue line without a tap; undo covers a wrong guess.
2. **How many cards per day?** Recommended: at most 2, counted even when taken or skipped, first after the 2nd task and second after the 5th. The owner said 1-2; 1 is safer for a person with few tasks, and the cap is a single constant to lower.
3. **What does Skip do?** Recommended: hide for 7 days, archive after the 3rd skip (still listed through the API). Alternative: never archive and keep rotating forever, which risks the same card nagging for months.
