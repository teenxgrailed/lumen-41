## Why

### Stage 1 (2026-07-22, shipped)

Today has the right building blocks but does not yet feel like one daily planner. The desktop layout gives the document and timeline noticeably different widths, the day heading is scaled like a mobile hero, the editor is only a short text area above separately rendered task groups, and task density does not match the Motion AI Agenda reference. This makes the screen feel assembled from widgets instead of being a calm Notes-like working canvas.

### Stage 2 — the day plan system (2026-11-19, owner brief)

People are tired of the default task manager. They have too many tasks, they do not know what to start with, and they do not open the phone app because it never reminds them it exists. They need a system, not one more list.

Research on 19.11 (Needt page "Needt planner system — research 19.11", id `cmwmscuj805bupg01uzkeb705`) found an open niche: a phone-first plan of the day with a limit that adapts to how much the person actually finishes. Neighbours each solve one piece: Sunsama limits the day in hours and auto-archives tasks that keep getting moved, Structured clears leftovers with a swipe, and Newport's shutdown ritual closes the day. Nobody combines them on the phone with an adaptive limit.

The ten decisions below were agreed with the owner on 19.11 and are not reopened in this change.

## What Changes

### Stage 1 (shipped)

- Keep the app's existing left navigation unchanged and rebuild only the Today surface.
- Make the desktop Today document primary with a narrow 260–340px one-day timeline.
- Turn the central area into one full-height, borderless daily document where prose and canonical task references can live in the same flow.
- Keep tasks in the existing `Task` model; agenda content stores only prose/formatting and task IDs, never duplicated task data.
- Match Motion's desktop density: a compact day header, larger readable task rows, correctly sized completion controls, inline date/duration metadata, and deliberate section rhythm.
- Preserve the existing date and duration pickers, Edit Task modal, autosave, day history, slash commands, mobile behavior, and the one-day timeline, while fixing their unfinished states.
- Add focused functional and visual coverage for Today in dark/light desktop, tablet, and mobile layouts.

### Stage 2 — the day plan system

Owner decisions, 19.11 (D1–D10):

- **D1 — Daily cycle.** In the evening the person leaves a note; AI turns it and the open tasks into a draft of tomorrow; in the morning the phone shows only that plan.
- **D2 — Limit.** The person picks the limit. Default 5 tasks, 3 of them main. Range 3–10 tasks and at most 5 hours of focus. After 2 weeks of history Needt suggests a limit based on what was actually finished.
- **D3 — Someday.** Tasks untouched for 14 days leave the home screen and go to "Someday". Once a week a one-tap cleanup.
- **D4 — Evening review.** Every unfinished task of the day is resolved: tomorrow / later (Someday) / delete. Nothing moves to tomorrow silently.
- **D5 — Everyone at once.** No rollout flags; at most a kill switch that is on by default. The plan becomes the phone home screen.
- **D6 — One brain, many channels.** The plan logic does not depend on a messenger; channels are adapters. Telegram first, WhatsApp later.
- **D7 — Two touches a day.** Morning plan and evening "close the day", at times the person sets (default 08:00 and 21:00). Nothing else is sent.
- **D8 — Bot.** The bot sends the plan and the evening review. A text or voice reply becomes tasks for tomorrow. Buttons "done" / "later".
- **D9 — Desktop.** The same day plan as a panel on `/today`; the calendar stays. A separate desktop design comes later.
- **D10 — Launch migration.** Everything untouched for more than 14 days goes to Someday once, with one screen offering "Return all".

Delivery is split into independently shippable pull requests:

- **A — Plan logic:** limit, main tasks, evening review, Someday, tomorrow's draft from a note (API, model, tests).
- **B — Two touches** over the existing web push, with time settings.
- **C — Messenger channel core** (adapter interface) **and the Telegram adapter**: bot, account linking, incoming text/voice to tasks, buttons.
- **D — UI:** new phone home, evening screen, `/today` desktop panel. Built only in the design chat with the owner; this change carries the brief and data contract only.
- **E — Someday launch migration:** script with dry-run.

Product analytics events: `plan_built`, `day_closed`, `task_to_someday`, `channel_reply` (with `channel: "telegram"`). The adaptive limit (D2) is computed from them.

## Capabilities

### New Capabilities

- `today-daily-document`: Defines the per-day editable document, canonical task-reference blocks, autosave/history behavior, and slash-command task creation. (Stage 1)
- `today-desktop-composition`: Defines the desktop split layout, document typography/density, and one-day timeline relationship. (Stage 1)
- `day-plan`: The plan of a day — limit, main tasks, the evening note, AI draft of tomorrow, accepting the plan, adaptive limit suggestion, kill switch, and the API that reaches all of it. (D1, D2, D5, D9)
- `evening-review`: Closing the day — every unfinished planned task is resolved explicitly; nothing carries over silently. (D4)
- `someday-bucket`: The Someday state — automatic move after 14 untouched days, return, weekly one-tap cleanup, and the one-time launch migration with dry-run. (D3, D10)
- `daily-touches`: The two daily notifications, their times, and the rule that nothing else is sent by this system. (D7)
- `messenger-channel`: Channel-independent plan conversations, account linking, and the Telegram adapter (text, voice, buttons). (D6, D8)
- `day-plan-analytics`: The four product events and their properties. (D2 input)

### Modified Capabilities

<!-- No existing OpenSpec capability currently owns Today or the plan. -->

## Impact

- Stage 1 ownership: `src/components/today/*`, `src/app/(app)/today/page.tsx`, and `src/app/api/daily-agenda/route.ts`.
- Stage 2 data: additive Prisma changes only (expand/contract): a day-plan record per user and date, plan settings per user, a Someday marker and last-touched time on `Task`, channel links per user. No destructive migration.
- Stage 2 API: new routes under `src/app/api/day-plan/*` and `src/app/api/channels/*`, mirrored in the public API and MCP so the plan is reachable from outside the UI.
- Stage 2 background work: BullMQ jobs for the two touches, the nightly Someday sweep and the draft of tomorrow; the existing cron handlers stay as safety nets.
- Reused, not rebuilt: `ai/parse-tasks` for the note and voice text, web push delivery, the scheduling engine's focus budget, `DailyAgenda` for the evening note.
- External: a Telegram bot token (env, owner-provided) and a speech-to-text provider for voice. WhatsApp is out of scope until the owner approves a paid provider.
- Owner approval required: running E on production (after a database copy and a dry-run), any paid WhatsApp provider, and merging D.
- The root `/` on phones points at the plan once D ships; until then it keeps its current target.
