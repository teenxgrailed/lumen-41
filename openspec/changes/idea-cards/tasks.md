## 1. Data

- [x] 1.1 Additive migration: enum `TaskKind`, `Task.kind` default `TASK`, `Task.ideaSource`, `ideaSnoozedUntil`, `ideaLastShownAt`, `ideaSkipCount`, `ideaCheckedAt`, `UserSettings.ideaCardsEnabled` default true; index on `(userId, kind, ideaLastShownAt)`.
- [x] 1.2 Flag `idea_cards` (key, known flag, helper) and the data migration turning it on for everyone.
- [x] 1.3 Events `idea_shown`, `idea_taken`, `idea_skipped` in `src/lib/activation-events.ts`.

## 2. Core

- [x] 2.1 Pure rules in `src/services/ideas/rules.ts`: keyword and commitment-word lists (EN/RU/UK/DE), candidate test, auto-convert test, card selection and cap, snooze and archive rule, notice line.
- [x] 2.2 Helper `openTaskWhere()` and `kind` in `taskView`; the invariants of an idea checked in one place.
- [x] 2.3 Ops `idea.create`, `idea.list`, `idea.convert`, `idea.take`, `idea.skip`, `idea.cards`; `task.list` and `task.get` return `kind`, `task.list` defaults to tasks; kind guards in `task.create` and `task.update`.
- [x] 2.4 Take: the scheduler places the one task now, falls back to the first day with room; `ideaLastShownAt` kept; undo back to idea.
- [ ] 2.5 Optional metered AI check that can only reject a candidate; Free without a key gets no call; claims released.

## 3. Exclusions

- [x] 3.1 Apply `openTaskWhere()` in the scheduler, day plan (limit, main tasks, plan), easy start (cap, create, sweep, backfill, proposals), reminders, nudges, digests, overdue reads and plan-limit counters.
- [x] 3.2 Client reads (Home, weekly review, goals standing, calendar blocks, settings derive) skip ideas.
- [x] 3.3 Test that fails when a scheduler or notification `prisma.task.find*` call neither uses the helper nor names `kind`.

## 4. Runtime

- [x] 4.1 Worker job `idea-sweep` (paged, stamped with `ideaCheckedAt`, per-run and per-day caps, rotating account cursor); runs before easy start.
- [x] 4.2 Realtime event and the one summed line "Moved N to Ideas" with Undo through the `notify` facade (copy only; visuals by the design chat).

## 5. Surface

- [x] 5.1 `ideaCardsEnabled` through `GET/PATCH /api/user-settings` and one row in Tasks settings (desktop and phone).
- [x] 5.2 REST `/api/ideas`, `/api/ideas/cards`, take, skip, convert; connector `/api/connect/ideas`; `docs/connector-api.md`.
- [x] 5.3 MCP tools `needt_create_idea`, `needt_list_ideas`, `needt_take_idea`, `needt_skip_idea`; `kind` on `needt_update_task` and `needt_list`.
- [x] 5.4 Changelog fragment.

## 6. Tests

- [x] 6.1 Jest: rules (keywords, commitment words, overdue and no-date cases, high priority, hard deadline, someday); convert both ways with undo; invariants rejected; cards (cap 2, rotation, same result on a second read, skip does not open a slot, snooze, archive after the 3rd skip, setting and flag off); take (placed today, falls to a later day, undo, easy start sees a normal task); exclusions (overdue read, digest, nudge, day-plan limit, easy start cap, scheduler capacity); sweep (paging, stamp, caps, undone not redone, summed notice); API, connector and MCP; analytics events carry no title.
