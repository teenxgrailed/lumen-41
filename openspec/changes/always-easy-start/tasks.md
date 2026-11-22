## 1. Data

- [x] 1.1 Additive migration: `UserSettings.easyStartMode` default `auto`, `UserSettings.easyStartExcludedProjectIds`, `Task.rescheduleCount`, `Task.simplifiedAt`, table `EasyStartProposal`.
- [x] 1.2 Flag `always_easy_start` (key, known flag, helper) and the data migration turning it on for everyone.

## 2. Core

- [x] 2.1 Pure rules: stuck test, overload selection, fallback entry, answer parser, notice lines, later-day test.
- [x] 2.2 Entry generation through the metered AI path; fallback when out of quota or Free without a key; claims released.
- [x] 2.3 Op `task.simplify` (with the in-transaction check); `task.restore` takes `entry`, `removePartIds` and the counters; `task.spread` takes `afterDay` and `notBefore`.
- [x] 2.4 Later-day counting in the scheduler, `task.update`, `task.move_to_day` and `PUT /api/tasks/:id`.
- [x] 2.5 Proposals ("suggest" mode): store, apply, dismiss, stale.

## 3. Runtime

- [x] 3.1 Worker jobs `easy-start-create`, `easy-start-sweep` and `easy-start-backfill`; enqueue on task create (app, connector, ops).
- [x] 3.2 Realtime event `easy-start` and the one-line notice with Undo or Apply.
- [x] 3.3 Sweep paging, stamping and rotating cursors; per-workspace balancing.

## 4. Surface

- [x] 4.1 `easyStartMode` and `easyStartExcludedProjectIds` through `GET/PATCH /api/user-settings` and two rows in Tasks settings (desktop and phone).
- [x] 4.2 `GET /api/easy-start/proposals` and `POST /api/easy-start/proposals/:id`; `entry` next to `title` in API task views.
- [x] 4.3 Changelog fragment.

## 5. Tests

- [x] 5.1 Jest: create gets entry and up to 3 subtasks; stuck task re-split with undo record; overloaded day moves the overflow, held by the not-before date; modes; excluded projects; kill switch; quota, Free and BYOK; claim release; entry typed meanwhile; undo conflicts; sweep paging; backfill; later-day counting in ops, route and scheduler; proposals API; notice.
