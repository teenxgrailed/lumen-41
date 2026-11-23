## Why

Owner idea, 22.11.2026 (his words: "подобные задачи ... можно просто сделать как рандом tasks idea, будет добавлять будто Ad в таски, что бы просто как идея типа прикольно, нужно бы посмотреть новости").

Some things people write down are not work with a deadline: read the AI agents news, watch a breakdown, try a tutorial. Needt treats them as tasks, so they get a date, slip, and turn into a red "Overdue - this was due 21 Nov" line that says the person failed at something optional. Always easy start (#778) makes the same task smaller; it does not change the fact that it is the wrong kind of object.

An optional thing should appear the way an ad slot does: now and then, between the real tasks, as a light "Idea: check AI agents news?" with Take and Skip. It never becomes late, and it never competes with the day's real tasks for room.

## What Changes

- **A second kind of task.** `Task.kind` (`task` default, `idea`). An idea is a normal task row with a stricter shape: no due date, no schedule, never overdue. One model, so projects, tags, pages, attachments, undo, realtime and the existing API and MCP keep working.
- **Idea cards.** A new "cards" read returns at most 2 ideas per local day, least recently shown first, for the Today and Home lists to place between tasks. Skip pushes an idea back 7 days. Take turns it into a task and places it now through the scheduler.
- **Where ideas come from.** The person saves one ("save as idea" or an API/MCP call with `kind: "idea"`); a task is converted to an idea with one action (and back); a periodic worker job converts tasks that are really ideas (keyword in the title plus overdue or moved later), with one summed notice and Undo. Suggested ideas from the person's interests are later, not in this change.
- **Exclusions.** Ideas have no due date and cannot be overdue; they are excluded from overdue counts and notifications, the day plan limit, the easy start overload cap (6/day) and easy start rewrites, scheduler capacity, and reminders.
- **Setting.** `UserSettings.ideaCardsEnabled` (default true). Off: no cards, no auto-conversion; stored ideas stay readable through the API.
- **Kill switch.** Server flag `idea_cards`, turned on for everyone by a data migration; it only exists to stop the feature without a deploy.
- **API and MCP.** `idea.*` ops with REST (`/api/ideas`), connector (`/api/connect/ideas`) and MCP tools to create, list, update, take, skip and convert.
- **Analytics.** `idea_shown`, `idea_taken`, `idea_skipped`.

Out of scope: the visual design of the card and the exact row position (the design chat). This change fixes the data contract and the rules.

## Impact

- Affected specs: new capability `idea-cards`; adds exclusion rules that touch `easy-start` and `day-plan` behaviour (no edit to their spec text).
- Affected code: `prisma/schema.prisma` (additive: `Task.kind` + idea fields, `UserSettings.ideaCardsEnabled`), `src/services/ideas/` (new), `src/services/ops/ops/ideas.ts` (new), `src/services/ops/ops/tasks.ts` (`task.list` filter, kind guards in create/update), `src/lib/needt/task-view.ts`, `src/app/api/ideas/`, `src/app/api/connect/ideas/`, `src/services/connectors/mcp/tools.ts`, `src/app/api/user-settings`, `src/lib/feature-flags*.ts`, `src/lib/activation-events.ts`, `src/worker/index.ts`, `src/lib/queue/*`, plus a `kind: "task"` filter in the scheduler, day plan, easy start, reminders, nudges, digests and overdue reads.
