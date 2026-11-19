# Tasks

## Wave 1 — Stable document contract

- [x] **T-001 — Split Today ownership cleanly** (REQ-001, REQ-008, REQ-012)
  - Extract Today-owned document/timeline components from `src/components/today/TodayView.tsx` without changing the app sidebar, main Calendar route, or shared Task modal behavior.
  - Completion: `TodayView` owns data/orchestration; extracted components own rendering and have explicit typed props.

- [x] **T-002 — Add canonical task-reference blocks** (REQ-003, REQ-005, REQ-006)
  - Implement a Tiptap task-reference extension/NodeView under `src/components/today/` using only `taskId` serialization.
  - Update `src/app/api/daily-agenda/route.ts` sanitization for the exact node contract and add tests for accepted task references plus rejected unsafe markup.
  - Completion: task references round-trip without copying title/date/duration/status into agenda content.

- [x] **T-003 — Make per-day persistence race-safe** (REQ-002, REQ-006, REQ-010)
  - Refactor `DailyAgendaEditor` hydration/debounce/flush behavior so stale GET/PUT work cannot overwrite another day or newer local content.
  - Preserve local content on save failure and expose retry.
  - Completion: rapid previous/next navigation plus reload restores the correct text for every date.

## Wave 2 — User-facing Today composition

- [x] **T-004 — Build one Notes-like daily canvas** (REQ-002, REQ-003, REQ-005, REQ-007)
  - Make the full document pane editable and compose prose, headings, lists, and task-reference blocks in one flow.
  - Reconcile missing/duplicate/moved/completed task references according to `design.md` without mutating canonical task data.
  - Completion: existing selected-day tasks appear once and `/task title` leaves a task row at the command position.

- [x] **T-005 — Finish Motion-like task rows and actions** (REQ-003, REQ-004, REQ-007, REQ-011)
  - Apply the desktop typography/control metrics from the design contract.
  - Preserve independent title/date/duration/completion targets and shared popup/modal styling.
  - Completion: title opens Edit Task; date/duration update inline; completion does not trigger another action; keyboard and touch targets pass.

- [x] **T-006 — Recompose desktop document and timeline** (REQ-001, REQ-007, REQ-008)
  - Use a flexible document with a 260–340px timeline, compact the desktop day header, align pane headers/divider, and keep independent stable scrolling.
  - Completion: at 1440px and 2048px the document remains primary, neither pane clips, and useful document content is visible above the fold.

- [x] **T-007 — Finish tablet/mobile and all UI states** (REQ-009, REQ-010, REQ-011)
  - Keep a single-column document below desktop, safe-area spacing, reduced motion, and explicit loading/empty/error/offline/partial-task states in both themes.
  - Completion: 768x1024 and 375x812 have no horizontal overflow, covered content, or layout jump.

## Wave 3 — Evidence and handoff

- [x] **T-008 — Add focused Today regression tests** (REQ-002–REQ-006, REQ-010)
  - Add unit/integration coverage for sanitizer, task-reference reconciliation, autosave/date races, create failure/retry, and historical completion behavior.
  - Run targeted Jest files only during iteration.

- [x] **T-009 — Add Today-only Playwright evidence** (REQ-001, REQ-004, REQ-007–REQ-011)
  - Add/update a Today-focused visual/e2e spec for desktop/tablet/mobile in dark/light plus the write, `/task`, date, duration, complete, modal, history, reload, and error flows.
  - Commands: `npm run test:visual -- --project=desktop <today-spec>`, then tablet/mobile after desktop is accepted.
  - Completion: screenshots match the user references in hierarchy/density and all interactions persist.

- [x] **T-010 — Targeted gate and release note** (REQ-001–REQ-012)
  - Run only the proportional gate requested for this block: targeted Jest, `npm run type-check`, Today visual/e2e, and `npm run lint`.
  - Update `CHANGELOG.md` under `[Unreleased]`, keep `.project-pilot` current, and review the diff for Calendar/sidebar/shared-file leakage.
  - Completion: no known high/medium Today defect; planning-only files ship with the actual Today code rather than triggering their own deployment.

---

# Stage 2 — Day plan system (2026-11-19)

Each PR ships on its own. Every owner decision has a test with a human name, written in the spirit of `test_leftover_task_is_not_moved_silently`.

## PR A — Plan logic (API, model, tests)

- [x] **A-1 — Schema.** Add `DayPlan`, `DayPlanItem`, `PlanSettings`, `Task.somedayAt`, `Task.somedayReason` and `SomedayMigrationMove` as one additive migration. Add the `day_plan` flag on at 100% through a data migration.
- [x] **A-2 — Plan service** (`src/services/day-plan/`): `buildDraft`, `closeDay`, `suggestLimit`, `sweepSomeday`, `restoreSomeday`, `cleanupSomeday`, plus the evening note through `DailyAgenda` and parse-tasks.
- [x] **A-3 — API and MCP.** Add the `/api/day-plan/*` and `/api/someday/*` routes with Zod validation and per-user scoping, and the MCP tools.
- [x] **A-4 — Scheduler guard.** Reschedule-on-miss must not move an item of an active plan to a later date.
- [x] **A-5 — Someday sweep job** in the worker, daily.
- [x] **A-6 — Analytics.** Register `plan_built`, `day_closed` and `task_to_someday` in `ACTIVATION_EVENTS` and record them. Events carry no content.
- [x] **A-7 — Tests**, one per decision:
  - `test_evening_note_becomes_tomorrows_draft` (D1)
  - `test_draft_never_overwrites_user_edits` (D1)
  - `test_default_plan_has_five_tasks_three_main` (D2)
  - `test_limit_outside_3_to_10_is_rejected` (D2)
  - `test_focus_budget_stops_plan_before_five_hours` (D2)
  - `test_limit_suggested_only_after_14_days_and_clamped` (D2)
  - `test_untouched_task_moves_to_someday_after_14_days` (D3)
  - `test_rescheduling_is_not_a_touch` (D3)
  - `test_task_with_near_deadline_stays_out_of_someday` (D3)
  - `test_weekly_cleanup_archives_not_deletes` (D3)
  - `test_every_leftover_needs_a_resolution_to_close_day` (D4)
  - `test_leftover_task_is_not_moved_silently` (D4)
  - `test_scheduler_does_not_move_planned_task_to_next_day` (D4)
  - `test_kill_switch_off_keeps_plan_data` (D5)
  - `test_other_users_plan_is_not_found` (API)
  - `test_events_carry_no_task_titles` (analytics)
- [x] **A-8 — Gates:** type-check, lint, unit, e2e and CI green. Update the CHANGELOG.

## PR B — Two touches over web push

- [ ] **B-1 — `day-plan-touch-sweep`** on the Reminder queue: per-user local time, compare-and-set idempotence, no guessed time zone, quiet hours respected.
- [ ] **B-2 — Content.** Morning: the main tasks plus "+N", opening `/today`. Evening: the leftover count, opening the review and note. The evening send builds tomorrow's draft.
- [ ] **B-3 — Settings API** for times and toggles. Skip the morning digest when the morning touch is on.
- [ ] **B-4 — Tests:**
  - `test_touches_default_to_8_and_21_local`
  - `test_touch_is_sent_once_per_day`
  - `test_no_touch_without_time_zone`
  - `test_touch_off_sends_nothing`
  - `test_plan_system_sends_only_two_touches` (D7)

## PR C — Channel core and Telegram adapter

- [ ] **C-1 — Schema:** `ChannelLink`, `ChannelLinkCode` and `ChannelUpdate`.
- [ ] **C-2 — Core.** The `ChannelAdapter` interface. Outgoing morning and evening messages come from the plan service; incoming text, voice and action events go to the plan service.
- [ ] **C-3 — Telegram adapter:**
  - webhook with `secret_token` verification and update dedupe
  - inline "done" and "later" buttons
  - link via deep link `?start=<code>`, plus unlink
- [ ] **C-4 — Voice:** a `transcribe` service behind the AI settings. Choose the provider, record the cost per minute in the PR, and fall back to asking for text.
- [ ] **C-5 — Touch fan-out.** B's sweep also sends through linked channels, still counted as one touch.
- [ ] **C-6 — Analytics:** `channel_reply`.
- [ ] **C-7 — Tests:**
  - `test_core_does_not_know_the_messenger` (D6)
  - `test_same_reply_gives_same_tasks_on_any_channel` (D6)
  - `test_unlinked_chat_creates_no_tasks`
  - `test_link_code_expires_after_10_minutes`
  - `test_done_button_completes_task` (D8)
  - `test_later_button_moves_task_to_someday` (D8)
  - `test_voice_reply_creates_tasks_for_tomorrow` (D8)
  - `test_duplicate_update_creates_tasks_once`
  - `test_forged_webhook_is_rejected`
- [ ] **C-8 — Live check.** On a test account, receive the morning plan in Telegram, and confirm a voice reply creates a task for tomorrow that is visible in Needt. Needs the bot token from the owner.

## PR D — UI (design chat only)

- [ ] **D-1** Hand the brief in `design.md` (Stage 2 → D) and the API contract to the Needt design chat. Build there with the owner, and merge only after the owner's ok on the screenshots.

## PR E — Someday launch migration

- [ ] **E-1 — Script** `scripts/someday-migration.ts` with `--dry-run` (the default) and `--apply`. It uses the same protection rules as the sweep, writes `SomedayMigrationMove` rows, is idempotent, and refuses `--apply` on production without a recorded backup id.
- [ ] **E-2 — "Return all"** endpoint. The migration screen is part of D.
- [ ] **E-3 — Tests:**
  - `test_dry_run_writes_nothing` (D10)
  - `test_migration_is_idempotent` (D10)
  - `test_return_all_restores_only_migrated_tasks` (D10)
  - `test_apply_refuses_without_backup` (D10)
- [ ] **E-4** Dry-run on a production copy, and report the number of tasks and users to Main. The real run waits for the owner's yes.
