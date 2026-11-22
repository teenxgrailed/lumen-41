## 1. Data

- [x] 1.1 Additive migration: `UserSettings.alwaysEasyStart` default true, `Task.rescheduleCount`, `Task.simplifiedAt`.
- [x] 1.2 Flag `always_easy_start` (key, known flag, helper) and the data migration turning it on for everyone.

## 2. Core

- [x] 2.1 Pure rules: stuck test, overload selection, fallback entry, answer parser, notice line.
- [x] 2.2 Entry generation through the metered AI path, fallback when out of quota.
- [x] 2.3 Op `task.simplify`; `task.restore` takes `entry` and `removePartIds`; `task.spread` takes `afterDay`.
- [x] 2.4 Reschedule counter in the scheduler.

## 3. Runtime

- [x] 3.1 Worker jobs `easy-start-create` and `easy-start-sweep`; enqueue on task create (app, connector, ops).
- [x] 3.2 Realtime event `easy-start` and the one-line notice with Undo.

## 4. Surface

- [x] 4.1 `alwaysEasyStart` through `GET/PATCH /api/user-settings` and one row in Tasks settings (desktop and phone).
- [x] 4.2 CHANGELOG entry.

## 5. Tests

- [x] 5.1 Jest: create gets entry and up to 3 subtasks; stuck task re-split with undo record; 10 tasks on a day move 2; toggle off; kill switch off; quota exhausted fallback.
