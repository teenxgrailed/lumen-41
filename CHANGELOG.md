# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] — 2026-10-25

<!-- changelog.d/admin-01-shell.md -->
- Admin panel: one `/admin` frame with a left nav (a row of tabs on a phone) in
  the v3 design, shared by Integrations (`/admin/system`) and Operations
  (`/admin/operations`). Inputs on the admin pages no longer render black on
  the Light theme: the admin scope now maps the older shadcn tokens onto the
  person's theme, so Light, Dark and Time all follow.
<!-- changelog.d/admin-02-overview.md -->
- Admin Users (`/admin/users`): search accounts by email and open one to see
  plan, trial end, created, last sign-in, role and connected provider names
  (never tokens). Each action asks first and is recorded in the new
  `AdminAuditLog` table (additive): make or remove admin, extend the trial,
  grant or revoke Pro for N days or Lifetime as a free comp (stored in the
  existing subscription row; Creem is never called), sign out of all devices,
  and delete the account through the existing deletion service (type the email
  to confirm). An admin cannot remove their own role or delete themselves.
  `GET /api/admin/users`, `GET /api/admin/users/:id`,
  `POST /api/admin/users/:id/actions`.

- Admin Overview (`/admin`): users total and new in 7 days, active trials, Pro,
  Lifetime and Free counts, waitlist size, and the app and worker build SHAs
  (a warning when they differ). `GET /api/admin/overview` (admin only). Users
  now carry a `createdAt` (additive column; older accounts are backfilled from
  their trial start where there is one).
<!-- changelog.d/ai-private-pages.md -->
- The assistant and connected AI tools (MCP: Claude, ChatGPT and others) no
  longer read, search or write Private pages, or any page filed under one.
  New daily notes, weekly reviews and pages made from a template are not
  Private by default, so the assistant can read them; turn Private on for a
  page to keep it out of reach. Pages that already exist keep their setting.
  Text from mail, calendar events, pages and other people's tasks is
  now handed to the assistant as quoted data it never takes orders from, the
  assistant's "today" only lists your own tasks, and one request can make at
  most 10 changes. Calendars, personal time and mail answer over MCP only from
  your personal workspace, not from a Team workspace.
<!-- changelog.d/app-icon-picker.md -->
- App icon: pick one of 13 Needt icons in Settings, Appearance, App icon
  (desktop and phone), and once for everyone in a "New icons for Needt" popup.
  Midnight, Ink, Sky and Paper are free; the other nine come with Pro (a trial
  counts) and open the paywall on Free. The choice follows you to every
  device, and changes the browser tab icon, the touch icon and the Needt mark
  in the app. The home-screen icon of an installed web app updates after you
  re-add Needt. Midnight is now the default icon everywhere, including the
  iOS and desktop app icons.
<!-- changelog.d/app-waitlist.md -->
- The download form on the landing page can now join the Mac and iPhone waitlists (`POST /api/waitlist` with `app`).
<!-- changelog.d/auto-schedule-settings-allowlist.md -->
- Auto-schedule settings accept only the preferences a person can edit, and the
  calendar scheduled tasks are pushed to must be one of their own.
<!-- changelog.d/board-link-share-state.md -->
- Switching on "Anyone with the link" on a moodboard now updates the Share dialog at once (it kept saying Private and showed no Copy link until reopened).
<!-- changelog.d/calendar-24h-strip.md -->
- The Calendar's Week shows all 24 hours and scrolls sideways a day at a time,
  like Notion Calendar: a trackpad swipe or Shift + wheel glides through days
  and settles on a day column, the arrows glide a week, Today glides back, and
  the date range in the header follows the scroll. The days are endless (only
  the columns near the screen are drawn). Hours outside your working hours and
  non-working days are shaded, and the grid opens with the current time about
  a third from the top. On the phone, swiping the day moves to the next or the
  previous day.
<!-- changelog.d/calendar-empty-week.md -->
- Calendar: with no calendar connected and no event in the week, a card over
  the week offers to connect a calendar or add an event, on the desktop and the
  phone. It goes as soon as either exists. A connected week with nothing in it
  says "Nothing this week".
<!-- changelog.d/calendar-shade-per-day-hours.md -->
- The calendar now shades off-hours from each weekday's own working hours: the break between two ranges is shaded too, and days off are shaded all day.
<!-- changelog.d/changelog-fragments.md -->
- Changelog entries now go into one file per pull request under
  `changelog.d/`, collected into `CHANGELOG.md` at release time with
  `npm run changelog:collect`. This ends the merge conflicts every PR had on
  `CHANGELOG.md`.
<!-- changelog.d/checkout-deeplinks.md -->
- Buy links from the landing page (`/settings?section=billing&checkout=pro-year|pro-month|lifetime`) open Plan & billing and start that checkout; signing in or signing up on the way brings you back to the same link.
<!-- changelog.d/chore-dead-code-flags.md -->
- Removed the pre-v3 UI now that design v3 is on for everyone: the
  `design_v3` flag branches (every signed-in route is the v3 frame; the sign-in,
  reset-password and confirm-email screens are v3), the old needt v2 screens
  (Today, Calendar, Workspace, Docs, Settings, mobile, auth), the old settings
  panels, task modal, boards UI, and the tests and visual baselines that only
  covered them. The `design_v3` FeatureFlag row stays in the database.
<!-- changelog.d/chore-fluidcalendar-leftovers.md -->
- Removed the last FluidCalendar leftovers: the Help link now points at
  Needt, the setup store's storage key is `needt-setup-storage` (the setup
  checklist state resets once), and the dead upstream publish workflow is
  gone. LICENSE and NOTICE keep the fork's MIT attribution.
- Import tasks from CalDAV servers (Baikal, Nextcloud, Fastmail, etc.): a connected CalDAV account's task collections (calendars that expose `VTODO`) can be mapped to a project and their tasks imported into Needt. Import is one-way for now - title, description, due/start dates, status, priority, and recurrence are read from the server, and an external-owned field cleared upstream (e.g. a completed task reopened) is cleared locally too so the import mirrors the server (#144)
- Fixed CalDAV events created or updated in Needt appearing at the wrong time in other calendar clients (Thunderbird, Home Assistant) when their timezone differs from the server's. Timed events are now serialized with an explicit timezone (`DTSTART;TZID=<zone>` plus a generated `VTIMEZONE`, falling back to UTC `Z` when no timezone is known) instead of floating local time, so recurring events also keep their wall-clock time across DST and the `TZ` environment-variable workaround is no longer needed (#135)
<!-- changelog.d/chore-release-prepare.md -->
- Releases are prepared by `npm run release:prepare -- <version> [date]`:
  collects the fragments, dates the release heading, bumps the web, Mac and
  iOS versions, checks What's new and writes `docs/releases/<version>.md`.
  The launch-day runbook is `docs/RELEASING.md`.
<!-- changelog.d/chrome-extension.md -->
- Needt for Chrome (`apps/extension`, not yet in the Web Store): add a page, link or selection as an
  auto-scheduled task (Alt+Shift+N, quick-add syntax), block your focus profile's sites while a focus
  block runs, a YouTube filter that keeps only videos on your current goal, a new tab with your next
  event and top tasks, and project tabs that reopen when the project's focus block starts.
  `GET /api/extension/projects` lists open projects for a bearer token.
<!-- changelog.d/collab-socket-wiring.md -->
- Documents and moodboards now sync in real time and save: the collaboration provider was moved onto a private socket that never connected, so edits stayed in a local draft.
<!-- changelog.d/connections-admin-hints-api-tile.md -->
- Connections: configuration hints (`COMPOSIO_API_KEY` and other environment
  names) are for admins only. The connect-start answers of Composio apps and
  both mailboxes now say "<App> isn't available yet." to everyone else.
- Connections: the "Needt API" tile now opens a sheet to create a personal
  access token, copy the MCP URL (`https://mcp.needt.app/mcp`) and open the
  connector API docs, on desktop and phone. It uses the existing
  `/api/connector-settings` route.
<!-- changelog.d/connector-place-and-pin-tasks.md -->
- Claude and other connected apps can now put a task at a time you name and
  pin it there, so the scheduler leaves it alone, or hand it back to the
  scheduler: `start`, `pinned` and `autoSchedule` on `needt_create_task`,
  `needt_update_task` and the new `PATCH /api/connect/tasks/:id`.
<!-- changelog.d/desktop-app.md -->
- Needt desktop app preview builds for macOS and Windows: tray icon, global quick-add shortcut, native notifications.
<!-- changelog.d/doc-title-pagehide.md -->
- A document title typed without leaving the field is no longer lost when the tab is reloaded or closed.
<!-- changelog.d/dock-settings-glyph-sizes.md -->
- Phone dock glyphs are 30 px (were 32). Settings icons are 28 px on the phone
  and 20 px on desktop, and Appearance, General and Data use the tune, settings
  and import glyphs from the design spec.
<!-- changelog.d/edge-debug-panel.md -->
- Opt-in `?edgedebug` panel that reports what sits at the screen edges, for the Safari bar bands.
<!-- changelog.d/energy-curve.md -->
- Energy curve (Pro, behind the `energy_curve` flag): pick a chronotype (lark, neutral, owl) with
  `PUT /api/energy/profile`. Auto-scheduling then puts heavy work in that curve's peak and light work in
  the after-lunch dip, unless you set your own energy hours.
<!-- changelog.d/failed-write-one-notice.md -->
- A change the server refuses (ticking a task, renaming a doc) is now sent once and says "Could not … Your change was reverted." once, instead of being retried and stacking a second notice.
<!-- changelog.d/feat-account-home-gaps.md -->
- Settings → Account, desktop and phone: a Sign-in methods card lists how you
  sign in (password and linked Google, Apple, GitHub, Microsoft, Discord, X,
  LinkedIn, ChatGPT); the password row mails a reset link. Devices names this
  device and when its session ends, and holds "Sign out of all devices".
  Data & privacy exports tasks as CSV as well as JSON
  (`GET /api/export/tasks?format=csv`); About shows the build.
- Home, desktop and phone: Plan my day now runs the real scheduler (preview,
  apply, one Undo) instead of opening Ask, still a Pro action. The Streak
  card shows "n days closed", derived from the tasks. "Notes for the day"
  opens today's note, a private document created on first use.
<!-- changelog.d/feat-ask-agent-tools-undo.md -->
- Ask now acts through the same operations as the MCP connector. It can create,
  change, move, complete and delete tasks, add and change calendar events,
  create and append to pages, and log habits; each change is recorded and listed
  under the reply with Undo, plus Undo all for the whole reply. Deleting asks
  first. Replies stream with a progress line while a tool runs, and can take
  several steps. New operations `event.create`, `event.update`, `event.delete`,
  `page.create` and `page.append` are available to connectors as well, and
  `task.create` accepts `entry`, `subtasks` and `dependsOnId`. Providers that
  cannot stream tool calls keep the previous single-step behaviour.
<!-- changelog.d/feat-ask-ai-provider-config.md -->
- Ask: the hosted AI endpoint can point at Z.ai (Zhipu) directly through
  `NEEDT_AI_BASE_URL` and `NEEDT_AI_MODEL`; the default stays GLM 5.3 Flash on
  OpenRouter. OpenRouter-only routing options are no longer sent to other hosts.
  See `docs/operations/ai-provider.md`.
<!-- changelog.d/feat-ask-plan-day.md -->
- Plan my day (Home button and strip, and Ask) now runs the scheduler as one
  recorded action and says where each task went ("Today 09:30–10:15 Taxes") and
  which did not fit, with one Undo. Pro and Lifetime only; the server refuses
  Free (`POST /api/ai/plan-day`). Ask can plan the day too (`plan_day`).
<!-- changelog.d/feat-ask-retrieval.md -->
- Ask can now find things across everything you keep: tasks, projects, calendar
  events, pages (titles and text), habits, moodboards and mail (sender, subject
  and date only). It searches first, reads only the one or two objects it needs,
  and links what it used in the answer. Scoped by workspace and page or board
  access; mail stays read-only and message bodies are read only through the
  existing mail tool. New agent tools: `search`, `get`, `list_events`.
<!-- changelog.d/feat-centered-notices-pro-modal-import.md -->
- What you just did ("Focus started · 25 min on …", "Placed at 14:00 · 3 Sep
  [Undo]") now appears as a compact pill at the bottom centre, inverted against
  the page: dark on Light, white on Dark, and on the phone above the bottom
  bar. The Ask Needt corner still carries Needt's own nudges. This also fixes
  confirmations and errors never showing on the phone.
- The Pro sheet ("Get more out of Needt") now opens from every locked PRO pill,
  Plan my day and Week load on Home, instead of sending you to Settings. For a
  Free account that has not had a trial its button reads "Start 14-day free
  trial" and starts it without a card (`POST /api/billing/trial`), also in
  Settings › Plan and on the phone. Paid plans still say checkout opens soon
  while `billing_checkout` is off.
- The sidebar has an Import button next to Create. A CSV of tasks imports now;
  From Notion starts the Notion import when it is set up. Markdown files,
  Google Docs and calendar files (.ics) are listed as "Soon": nothing backs
  them yet.
<!-- changelog.d/feat-composer-expand.md -->
- The quick-add line writes the repeat it understood ("every friday" becomes a
  weekly task that starts on the next Friday) and has an expand button: ⌘↵ or
  the corner button adds the task and opens it in the full task dialog. Enter
  still adds and stays.
<!-- changelog.d/feat-connect-today-widget-api.md -->
- Connector token API for widgets: `GET /api/connect/today` (one payload:
  counts, next task, Daily Highlight, habits, next event, next personal-time
  block, free minutes, weather line), `GET /api/connect/highlight`,
  `GET /api/connect/habits/today` and `POST /api/connect/habits/:id/toggle-today`.
  "Today" is the day in your saved time zone.
<!-- changelog.d/feat-docs-editor-blocks-2.md -->
- Document editor: **Toggle, Callout and Columns are real blocks.** A Toggle
  folds the blocks under its title (the arrow remembers open or closed on this
  device); a Callout has an icon and a colour (the document palette) and holds
  any blocks; Columns are two or three side by side, resizable by their divider
  (arrow keys work too) and stacked on a phone. They go in empty from `/` with
  the caret inside, instead of asking for text in a dialog. Pages saved with the
  old, uneditable Callout/Toggle/Columns blocks open as the new blocks (text
  kept) and are rewritten in the new shape on the next save.
<!-- changelog.d/feat-docs-editor-colors-4.md -->
- Document editor: the selection bar gets **Underline**, **Text colour** and
  **Highlight**. Colours are the document hues (Umber, Wine, Plum, Navy,
  Forest), stored by name and drawn in the reading that is legible on the page
  (pale hues on a dark page); `==text==` and Mod+Shift+H highlight, and the phone
  Format sheet has the same colours.
<!-- changelog.d/feat-docs-editor-export-5.md -->
- Document export: Page options gets **Export as Markdown** (a `.md` download
  of the page as it is on screen) and **Export as PDF** (the browser's print
  with the page alone on the paper, in its own style). The same Markdown is
  served by `GET /api/pages/:id/export?format=md` (same access as the page
  itself; documented in `docs/connector-api.md`).
<!-- changelog.d/feat-docs-editor-fixes-1.md -->
- Document editor, first pass: **Link** in the selection bar (and in the
  context menu and the phone Format sheet) now links the selected text, with
  **Mod+K**; the Link block is only used when nothing is selected. The `/` menu
  opens at the start of any word, not only in an empty line, and says "No
  blocks match" instead of vanishing. Images can be pasted or dropped into a
  page (same upload as the Image block). `/pages/<id>#<blockId>` now scrolls to
  and marks that block. Tables (and special blocks) keep a stable `blockId`
  between saves, and a table is stored as type `TABLE`.
<!-- changelog.d/feat-docs-editor-tables-3.md -->
- Document editor tables: a bar over the table while the caret is in it adds a
  row above or below, adds a column left or right, deletes the row, column or
  the whole table (the last row or column deletes the table), and switches the
  header row and header column. Tab and Shift+Tab move between cells, and Tab in
  the last cell adds a row. Column borders show the resize cursor and handle.
<!-- changelog.d/feat-docs-style-gates-6.md -->
- Free and Pro document styles: all four fonts and three page colours (White,
  Paper, Graphite) stay free; a backdrop, a cover (drawn art or your own
  picture), the other page colours and every All Styles preset but Default are
  Pro. The Style panel and the phone Page Style sheet mark them with a lock and
  open the paywall, and the pages API refuses them on a free plan
  (`UPGRADE_REQUIRED`, keys `backdrop`, `page`, `cover`). What a page already
  has is kept after a downgrade, and a free plan can still remove a cover.
<!-- changelog.d/feat-habits-history.md -->
- Habits: a past day can be marked or unmarked
  (`PUT/DELETE /api/habits/:id/completions/:date`, up to 400 days back). On the
  phone each habit has a "Past days" panel with its last four months, and
  streaks count past 14 days; on the desktop, pick one habit in "Last four
  months" and click a past dot.
<!-- changelog.d/feat-icloud-guide.md -->
- The Apple / iCloud connect dialog now walks through creating an app-specific
  password step by step (with Apple's labels, a button that opens
  account.apple.com, three schematic sketches and a "Not working?" list), and
  failures say what to do: wrong password type, no calendars found, or iCloud
  unreachable. Same steps in docs/help/connect-icloud.md.
<!-- changelog.d/feat-moodboard-controls.md -->
- Moodboards: Import from Pinterest (Pro). Connect Pinterest read-only from a
  board's Add menu (or Connections), pick one of your boards, and its Pins are
  copied onto the moodboard as pictures that keep their Pin link. An optional
  "Keep in sync" adds new Pins once a day and never removes anything; if
  Pinterest revokes access the tile says "Needs attention" until you
  reconnect. The disabled "Coming soon" Pinterest rows are gone. Setup:
  `docs/operations/pinterest.md`.
<!-- changelog.d/feat-per-day-hours.md -->
- Working hours are now set per weekday in Settings > Your day: each day has
  its own switch and hours, and a second range for a lunch break (for example
  9:00-13:00 and 14:00-18:00). The calendar shading, auto-scheduling, capacity
  and free-time nudges all follow the per-day hours. The phone settings have
  the same per-day editor. The "Plan on weekends" switch is gone: Saturday and
  Sunday are ordinary days now, and people who had weekends on keep them.
- New setting: Time format (12-hour or 24-hour) under Calendar, on desktop and
  phone. The calendar already read it; there was no control for it.
<!-- changelog.d/feat-recurring-next.md -->
- Recurring tasks now work end to end. Completing one (in the app, through
  `PUT /api/tasks/:id`, the `task.complete` op or `needt_complete_task`) records
  that occurrence as a finished task and moves the same task to its next date,
  keeping its time of day. The series is anchored on the task's own date, so
  "every week" no longer follows the weekday you happen to tick it on, "every
  day" no longer skips a day, and ticking an overdue task lands it on a coming
  date. The Repeat chip gains Custom: every N days, weeks or months, on chosen
  weekdays. `task.complete` no longer refuses recurring tasks, and Undo puts the
  date back and removes the recorded occurrence.
<!-- changelog.d/feat-shared-sortable.md -->
- Reordering works the same everywhere on desktop: Customize Sidebar (Places
  and Sections), subtasks in the task dialog and the moodboard wall now share
  one sortable list. The row follows the pointer (transform only), the others
  slide aside, it drops where the gap shows, text no longer selects while
  dragging, the grip shows a grab cursor, and Space, the arrows and Space
  again reorder from the keyboard with a spoken position. A failed save puts
  the old order back.
<!-- changelog.d/feat-status-banners.md -->
- The desktop top bar now shows the offline pill, and status banners appear
  under it: "Google Calendar / Gmail access was revoked" with Reconnect (when
  every calendar of an account fails to sync, or a mailbox is in error),
  "AI paused" when the monthly AI allowance is spent, and "AI is temporarily
  unavailable" when no AI key is configured for the person or the server.
  `GET /api/accounts` gains `needsReconnect`.
<!-- changelog.d/feat-sync-now.md -->
- Connections: "Sync now" on a connected calendar or mailbox (the card menu on
  the desktop, the account sheet on the phone). It queues the worker's sync job
  (`POST /api/accounts/:id/sync` for calendars, the existing
  `POST /api/mail/sync` for mail) and says the sync started.
<!-- changelog.d/feat-task-dialog-complete.md -->
- Tasks gain the fields the v3 task dialog needs, readable and writable through
  the task API, the connector ops and the MCP tools: labels (`tagIds` /
  `labelIds`), repeat (`recurrenceRule`, validated; the `isRecurring` flag now
  follows it on `PUT /api/tasks/:id`), hours (`scheduleId`), "No priority"
  (`priority: "none"` on the API, `NONE` in ops and MCP), `createdAt` in the
  task view, and files: `GET`/`POST /api/tasks/:id/attachments` and
  `GET`/`DELETE …/:attachmentId` (images and PDF, 4 MB, ten per task, bytes in
  Postgres, served `nosniff`), plus `task.attach` / `task.detach` ops and the
  `needt_attach_file` / `needt_remove_attachment` tools. Linking a label that
  is not yours is refused.
<!-- changelog.d/feat-task-dialog-ui2.md -->
- The task dialog and the phone task sheet now have Labels, Repeat, Hours (your
  work schedules, shown once you have two or more), a "No priority" choice and
  Attachments (images and PDF, 4 MB each, ten per task). The dialog also shows
  when the task was created, and its Start focus button on the first step
  starts a focus session on it. A task synced from Outlook or Google Tasks
  shows its title and repeat read-only, since the next sync overwrites them.
<!-- changelog.d/first-run-sample-day.md -->
- First run: setup is three short steps (what you use Needt for: Work, Study,
  Personal or Side project; connect a calendar, only the providers this server
  can run; your working hours, day by day), plus an Import step when Todoist or
  Notion is configured. Then you land on Today with a sample day matching the
  first use you picked: a project, six tasks (one overdue, one with subtasks),
  a "Start here" document and a habit. Examples are marked, never count toward
  Free limits, and one "Clear examples" button (Today, or Settings under Data)
  removes them all. `POST` / `DELETE /api/onboarding/sample` (and the token form
  under `/api/connect`) do the same from outside. Existing accounts are not
  given examples.
<!-- changelog.d/first-run-time-zone.md -->
- New accounts start in the browser's time zone, with the week starting on
  Monday and a 24-hour clock where the browser language uses them, instead of
  UTC, Sunday and 12h. Accounts still at the UTC default are moved once on
  their next signed-in load; a zone someone picked is never replaced.
<!-- changelog.d/fix-mail-held-tabs-fainter.md -->
- The Mailbox's held Sent and Drafts tabs are fainter: the one text colour at
  its disabled alpha instead of a stacked opacity. They stay disabled, and the
  tooltip still says the folder is not synced yet. (The phone Mailbox has no
  Sent or Drafts tabs.)
<!-- changelog.d/fix-oauth-resource-alias.md -->
- Adding Needt to claude.ai or ChatGPT with the older URL
  `https://use.needt.app/api/mcp` now works: OAuth accepts it as an alias of
  `https://mcp.needt.app/mcp`, and tokens issued for either URL work at both
  endpoints. Any other resource is still refused.
<!-- changelog.d/fix-release-deploys-newest.md -->
- Production deploys no longer stall while merges keep landing. A release used
  to stand down unless its commit was still the head of main, and with a
  25-minute build and merges every few minutes none ever deployed (production
  sat at 4c9c2ee). Now the newest finished build deploys unless production
  already runs it or a descendant: the deploy script pins the Coolify
  application to the built commit first (needs the token's `write` ability;
  without it, it deploys the head of main if its images are already in GHCR).
<!-- changelog.d/fix-screen-layout-width-2.md -->
- Docs, Trash, Moodboards, Templates and Shared keep their header, grids and
  lists in the same content column as Tasks on wide windows; the Trash list
  fills that column instead of stopping at two thirds.
<!-- changelog.d/fix-screen-layout-width.md -->
- Tasks, Projects and a project page now use one content width: task rows fill
  the same column as the header and the project tiles, with time, duration and
  project at the right edge instead of floating in the middle on wide windows.
<!-- changelog.d/fix-task-deadline-follows-due.md -->
- Fix: moving a task's due date through Ask or the Needt connector now moves its
  deadline with it when the two were the same date, so the scheduler stops
  placing the task by the old one. `needt_update_task` and `task.update` also
  accept `deadline` to set it on its own.
<!-- changelog.d/focus-blocking-profiles.md -->
- Focus blocking profiles (Pro, behind the `focus_blocking` flag): name the sites and Mac apps to
  block while a focus session runs, a matching calendar event is on, or a task of a chosen project is
  scheduled. `GET /api/blocking/active` says what to block right now and why; profiles live at
  `/api/blocking/profiles` and in the `needt_blocking` / `needt_blocking_profile` MCP tools.
<!-- changelog.d/focus-done-ends-session.md -->
- Marking a task done ends its running Focus session on every device and path
  (app, API, MCP, connector). Finishing early shows "Done 12 min early" and gives
  the saved minutes back to the day.
- New task setting "Do for the full time" (`fullTime`, on by default for habit
  and repeating tasks): ticking the task asks "N min left: keep going or end
  now" instead of ending the session. Available in the task dialog, on the
  phone, the task API and the MCP tools.
<!-- changelog.d/focus-done-prompt.md -->
- When a Focus session on a task ends (the clock runs out or you stop early), Needt asks "Done with <task>?" with Done, Not yet and, after a finished timer, +15 min. Done closes the task and offers Undo; leaving without answering keeps the question as one notice. The Focus ended push gains a "Mark done" action that closes the task without opening the app, and tapping the push (the only option on iOS) opens the app straight on the question.
<!-- changelog.d/focus-ended-notification.md -->
- Needt tells you when a Focus session ends: a push saying "Focus done" with the task and length, and a quiet notice in any open window. The session you paused, extended or ended early is followed, and Settings → Notifications has a "Focus ended" switch (on by default).
- Settings → Notifications no longer offers Daily plan and Weekly review: nothing sent them. Overdue tasks and Focus ended remain.
<!-- changelog.d/free-dock-mailbox.md -->
- On the Free plan, Mailbox now sits under More instead of taking one of the
  five sidebar tiles, since Free has no mailboxes; Projects takes its place.
  A layout you saved yourself is left as it is.
<!-- changelog.d/home-daily-highlight.md -->
- Home: pick one task as today's highlight (the task menu, "Make highlight"). It is
  shown big at the top of Home with a one-tap Complete and Start focus, and is
  lifted out of the lists below. Stored per day and readable through
  `GET /api/highlight`.
<!-- changelog.d/home-endday-nudge.md -->
- Home: in the last 30 minutes of your working day (per-day hours) a one-line
  prompt offers End day; dismiss it for the day. End day is also in the + menu.
<!-- changelog.d/home-energy-order.md -->
- Energy-aware order: a task's energy (high / medium / low) now shapes the day.
  On Home, tasks without an hour are ordered heavy-first during your high-energy
  hours and light-first after them; the scheduler keeps heavy tasks to those hours
  and light ones later. Set the hours in Settings, Your day (the morning by default).
<!-- changelog.d/home-finish-day.md -->
- Home: when today's tasks are done, the "All done" banner becomes a compact
  card with the 2–3 best next tasks (from overdue, tomorrow and the Inbox) and
  a one-tap "Do today". "End day" opens a short shutdown: what got done,
  leftovers to move to tomorrow, a date or the Inbox, and a note for tomorrow
  that is saved into tomorrow's daily note. The card no longer says "All done"
  while overdue or Inbox tasks are still open. New `POST /api/pages/:id/append`.
<!-- changelog.d/home-ha-data.md -->
- The three focuses picked in the Sunday review are now saved for the week
  ahead (`/api/week-focus`, documented in the Connector API) and become the
  first candidates for the day's highlight.
- Highlight suggestions come with a one-line reason each. With Pro, the agent
  picks and words them (`/api/ai/highlight-suggestions`, once a day, counted as
  one AI action); without it the same suggestions come from the usual rules.
- The morning brief now shows until 11:00 or the first task you finish,
  whichever comes first (it was until noon).
- The first-event line on Home no longer says when to leave: Needt has no real
  travel time, so it shows only the weather and the first event.
<!-- changelog.d/home-ha-desktop.md -->
- Desktop Home follows the new design: the Highlight card takes the Next up
  slot (the agent's suggestion with its reason, set, or plain Next up), Today
  with the time-left bar and Habits sit on the right, This week sits above the
  schedule, the weather and first event are beside the date and the morning
  brief is one line under the header. Free sees the brief and the suggestion's
  Yes with PRO.
<!-- changelog.d/home-ha-phone.md -->
- Phone Home has the new look for its top: habits as pills (emoji, N/target
  with a ring for weekly ones), one Highlight card in place of Next up and the
  separate suggestion row (the agent's suggestion with its reason, Yes or
  Another; set; or plain Next up), then the morning brief, weather with the
  first event, and the time-left bar. Free sees the brief and the suggestion's
  Yes with PRO; a tap opens the plans. The brief also shows the note End day
  left the evening before.
<!-- changelog.d/home-ha-wire.md -->
- Home's End day, All done, schedule and weekly review use the new design on
  the phone and the desktop: the End day and review sheets, the all-done card
  with "Pull something in", and personal time as striped bands among the
  schedule rows. What they do is unchanged (moves, the note for tomorrow in
  tomorrow's daily note, Undo).
- The weekly review now asks for exactly three focuses picked from your open
  tasks and projects (no typing). They are saved as references in
  `/api/week-focus` (a `taskId` or a `projectId` with its name), and the day's
  highlight suggestions use those ids. Older title-only entries are still read.
<!-- changelog.d/home-highlight-suggest.md -->
- Home: in the morning, with no highlight set, a one-line suggestion offers the
  most important task due today. Tap Yes to make it the highlight, or Another
  for a different one.
<!-- changelog.d/home-morning-brief.md -->
- Home (Pro): in the morning, Ask writes a 2–3 line brief at the top of Home: what
  matters today, what is overdue, how much free time is left. Written once a day
  through the usual hosted AI allowance, cached, and dismissible. Free accounts
  and accounts without working AI see nothing. New `/api/ai/morning-brief`.
<!-- changelog.d/home-phone-habits-dup.md -->
- Phone Home: the old collapsible Habits section is gone; the row of habit circles
  under the date replaces it.
<!-- changelog.d/home-phone-habits-row.md -->
- Phone Home: a row of habit circles under the date (emoji or initial, a ring for
  the week so far). Tap to keep today; it scrolls when there are many and is
  hidden when you have no habits.
<!-- changelog.d/home-polish-city-picker.md -->
- Settings, General: the weather City is now a picker. Type a few letters, choose a city from the list (name, region, country), and the weather uses its exact location. A cross clears it. Same picker on the phone. Only what you type is sent, through our server.
- Home: the Today card's time bar now shows planned time as a solid stretch, free time as a dashed track and, when the day is overbooked, the part that does not fit as red dashes past a marked end of the day.
- Home: the header no longer repeats "Today · week N", and the weather line sits level with the date heading.
<!-- changelog.d/home-schedule-band-slot.md -->
- Home: the day timeline has a slot above its rows for the personal-time band
  (nothing shows until the band lands).
<!-- changelog.d/home-spread-across-week.md -->
- An overbooked day on Home now offers a way out: "Spread across the week" on
  the time-left card gives today's untimed tasks the next days that still have
  room (each day's own working hours, less events, personal time and what is
  already on it), and Overdue has Spread beside Move to today, with Spread
  first when today is already full. One Undo puts every task back. The same
  spread is the `task.spread` operation in the API and `needt_reschedule` with
  `taskIds` or `scope` in MCP.
- Next up's title stops at two lines with an ellipsis, and the whole title
  shows on hover; phone rows show theirs on hover too.
<!-- changelog.d/home-stats.md -->
- Home: a small "This week" card (done count, seven bars with the best day marked,
  your streak) that replaces the Streak card and hides itself when there is
  nothing to show. Tap it for the full stats: week or month, done per day, by
  project, best weekday and Focus minutes. New `GET /api/stats?range=week|month`.
<!-- changelog.d/home-time-left-personal.md -->
- Home: the time-left line takes your personal time (lunch, a walk) out of the free
  time, and the phone's day shows the same quiet personal bands as the desktop.
<!-- changelog.d/home-time-left.md -->
- Home: a thin time-left line compares what is planned today with the working
  time that remains, and warns softly when the day is overbooked.
<!-- changelog.d/home-weather-line.md -->
- Weather on Home: add a City in Settings, General and a tiny line shows today's weather
  (Open-Meteo, no key) and the first event of the day, with when to leave if it has
  a location. Empty by default, and then nothing shows. Only the city name is sent;
  your device location is never used. New `GET /api/weather`.
<!-- changelog.d/home-weekly-review.md -->
- Sundays on Home: a short weekly review. See the week's wins, move what is left over
  (Monday, a date or the Inbox) and pick three focuses for next week. It is saved as
  a page, "Weekly review · <date>", reachable through the pages API.
<!-- changelog.d/imap-require-tls.md -->
- IMAP mailboxes connect only over an encrypted session: SSL/TLS on port 993 or
  STARTTLS on port 143. A server that offers neither is refused with a message
  that says so, and an existing IMAP mailbox whose server has no STARTTLS stops
  syncing instead of sending its password in plaintext.
<!-- changelog.d/inline-subtasks.md -->
- Task lists show subtasks inline: under the title a row shows its next step
  ("Step 2: Draft the page", numbered by position, the first two-minute step is
  Step 1), and a tap on the 0/3 count unfolds every step with a tick of its own.
  Works on Home, Tasks, the Calendar peek and the phone. The task view gear has a
  Subtasks choice (Next step + expand, All steps open, Count only) that replaces
  the old on/off; an old "off" reads as Count only. The big "+" in a project
  page's header is gone: the "Add a task" row below it is the one place to add.
<!-- changelog.d/ios-install-head.md -->
- Adding Needt to the iPhone Home Screen always installs the app: the sheet
  names it "Needt" and it opens full screen, without Safari's address bar
  after you leave Home. The install tags no longer arrive late in the page.
<!-- changelog.d/ios-install-redirect-host.md -->
- Signing in on a local or test host keeps you on the address you opened, so
  an installed app there no longer drops into Safari's controls.
<!-- changelog.d/landing-glyphs-dock-settings.md -->
- The phone dock and Settings (phone and desktop) use the landing icon set: larger bare icons in the dock with no tile behind them, and a glyph per Settings section.
<!-- changelog.d/learn-about-me.md -->
- Settings has a new switch, "Let Needt learn about me", off by default. When
  on, Needt learns your work habits from your tasks, keeps preferences you tell
  Ask, and picks up short facts from your documents and mail subjects (never
  mail bodies). Ask, the morning brief and the scheduler use them: blocks follow
  how long your tasks really take. Settings, Memories lists every line with its
  source and date, and you can edit, delete or forget all. Also through
  `/api/ai/memories` and MCP.
<!-- changelog.d/legacy-routes-redirect.md -->
- The old Chat, Focus and Quick add screens are gone: `/chat` opens Ask on
  Today, `/focus` opens Today and `/quick-add` opens the new-task composer.
<!-- changelog.d/lifetime-seats.md -->
- A public seat counter for the Lifetime plan (`GET /api/lifetime-seats`) feeds the landing page.
<!-- changelog.d/mac-app-fixed-frame.md -->
- Mac app: the window is a fixed frame again. The top bar stays put and only
  the panes scroll; the sidebar no longer slides up under the window buttons.
- Mac app: Ask Needt is back in the bottom-right corner, and the empty rounded
  box that floated over the last task row is gone.
- Mac app: Settings and the menus open faster (the section and the plan card's
  sky load after the sheet has appeared; no background blur in the app).
<!-- changelog.d/mac-webkit-desktop-paint.md -->
- Mac app: the Connections sky fills its whole box, the Connections title no longer sits on its subtitle, the notification corner is only as big as its toast, and Ask Needt opens from a visible pill. The app also idles more when nothing moves.
<!-- changelog.d/mail-oauth-state-pkce.md -->
- Connecting a Gmail or Outlook mailbox now verifies the sign-in came from your
  own browser (OAuth state and PKCE), so a crafted link can no longer attach
  someone else's mailbox to your account.
<!-- changelog.d/mcp-writes-live-refresh.md -->
- Changes made through the Needt connector (MCP) or an AI assistant, such as ticking a subtask, adding subtasks, completing or editing a task, logging a habit, or writing a page, now show up in the open app at once instead of after a reload. Subtask changes also update the task's last-changed time.
<!-- changelog.d/memories-phone.md -->
- Settings, Data on the phone has the Memories group: the "Let Needt learn about
  me" switch, the list of what Needt learned, edit, delete and Forget all.
<!-- changelog.d/memory-tombstones.md -->
- A work-habit memory you delete in Settings, Memories no longer comes back at
  the next recompute. Forget all resets that.
<!-- changelog.d/moodboard-cover-fidelity.md -->
- Moodboards: the phone board cover now fills its fourth cell (the list sent three
  references, the cover draws four), a link cell on it takes its site's hue, and the
  desktop cover tints a link that has no picture by its site, as in the design.
<!-- changelog.d/moodboard-item-comments.md -->
- Moodboards: comment on a reference. The reference sheet (desktop and phone)
  shows a thread with Resolve and Delete; editors write, viewers read. The
  board's owner and earlier commenters are told in their notifications. API:
  `/api/moodboards/:id/items/:itemId/comments` (docs/connector-api.md).
<!-- changelog.d/moodboards-share-notification.md -->
- Moodboards: a person invited to a board now sees "<name> shared <board> with
  you" in their notifications, linking to the board.
<!-- changelog.d/morning-brief-count-and-length.md -->
- The morning brief keeps the leading count ("14 tasks open today") and is now two short sentences at most.
<!-- changelog.d/onboarding-v3-flag.md -->
- New accounts can start in the 18-screen `/start` onboarding instead of
  `/setup`, behind the server flag `onboarding_v3` (off by default; per-user
  overrides apply). Finishing either flow now records
  `User.onboardingCompletedAt`, and someone the flag is on for who opens Today
  with nothing set up is sent into the flow once, then sees a banner they can
  close. Admins can list every flag at `GET /api/admin/feature-flags` and turn
  on a flag that has no row yet.
<!-- changelog.d/onboarding-v3.md -->
- New 18-screen onboarding at `/start` (desktop and phone): pick your areas,
  tasks and repeats, rank what matters, set your days and rhythm, watch Needt
  plan next week with the real scheduler, then save it with an account. The
  answers, the plan preview and the final write are all in the API
  (`POST /api/onboarding/plan`, `GET`/`PUT /api/onboarding/answers`,
  `POST /api/onboarding/commit`).
- The 14-day Pro gift starts when the email is confirmed. Choosing Pro or
  Lifetime asks for a card through Creem (Pro is charged when the gift ends,
  Lifetime now); Free needs no card, and "Continue without a subscription"
  keeps the gift and then drops to Free. Checkout stays behind the billing flag.
<!-- changelog.d/one-sync-status.md -->
- One quiet sync status in the top bar of every screen, on desktop and phone: a
  dot and one word (Saved fades to the dot; Syncing…; Offline with the number
  of changes waiting; Error). Click for the details and Retry. On a document or
  board it also reads the live provider, and a draft kept only on this device
  shows as an error rather than Saved. It replaces the document's separate dot
  and "Saved", and the old offline pill. Your own avatar is no longer shown in
  a document; only other people in it appear.
- The document rail's second sidebar button (the layout icon) is gone. The
  panel icon in the top bar, with its ⌘\ shortcut, is the one sidebar toggle.
<!-- changelog.d/ops-task-placement-undo.md -->
- Placing, pinning and unpinning a task through the operations API
  (`task.update` and `task.create` with `start`, `pinned`, `autoSchedule`) now
  works like the connector and the app, and can be undone: the previous
  time, pin and scheduled blocks come back exactly.
<!-- changelog.d/personal-band-drag-resize.md -->
- Personal time can be moved and resized on the calendar grid: drag a band
  to a new time, or pull its bottom edge to change when it ends. It snaps to
  15 minutes and is never shorter than that. A repeating block asks first,
  because every repeat moves with it; a block marked on a calendar event stays
  put and follows the event.
<!-- changelog.d/personal-home-band.md -->
- Home shows your personal time (Lunch, a Walk and so on) as a calm band above
  today's schedule, and on the phone's Today.
<!-- changelog.d/personal-time-edit.md -->
- Personal time can be changed. Open a block on the calendar (the card on the
  desktop, the sheet on the phone), tap Edit and change its name, when it
  starts and ends, and the days it repeats on. A repeating block changes as a
  whole; a block marked on a calendar event keeps the event's time and only
  takes a new name. Before this a block could only be made or removed. Undo
  puts the old values back.
<!-- changelog.d/personal-time.md -->
- Personal time: keep Lunch, a Break, a Walk, Dinner, the Gym, a Party or Rest
  for yourself. Needt never schedules a task in it, Plan my day included, and it
  stays inside Needt (nothing is written to Google or iCloud). Add one with a
  tap from Create, from an empty slot on the calendar, or by asking Ask; set
  repeating defaults (for example Lunch on weekdays at 13:00) under Settings,
  Your day; or mark any calendar event as personal time. It shows as a calm,
  tinted band on the calendar (desktop and phone) and in Home's day. Dragging a
  task into it asks first. Readable and writable through the API, MCP and Ask,
  with Undo.
  New accounts start with Lunch kept on weekdays, 13:00 to 14:00; edit it under
  Settings, Your day.
<!-- changelog.d/personal-token-expiry.md -->
- Personal `needt_` access tokens now expire one year after they are created.
  Settings › Connections shows when the current token expires; a token made
  before this change keeps working until it is rotated.
<!-- changelog.d/phone-bands-budget.md -->
Phone (iPhone Safari and the installed app): the blurred top band, the bottom fog and the menu scrim stop a few pixels short of the display edge, so the status bar and the toolbar take the page colour again instead of a tinted strip.
<!-- changelog.d/phone-bottom-band.md -->
- The phone app fills the whole screen in the installed iOS app: the flat band under the dock is gone on every screen.
<!-- changelog.d/phone-browser-bars-tint.md -->
- In Safari, the bars above and below the phone screen take the colour that is under each edge of the current screen, including while a sheet or the search plate is open.
<!-- changelog.d/phone-doc-keyboard-bar.md -->
- Editing a document on iPhone: the formatting bar now sits directly on the keyboard (it used to stay behind it), shows only while the page has focus, and the line you type is kept above it.
- The block grip no longer appears over the words you are selecting: a long press in the left gutter opens it, and typing or selecting puts it away.
- The darker strip under the bar in a document is gone: the bar no longer floats above a reserved dock gap.
<!-- changelog.d/phone-dock-bottom-offset.md -->
Phone: the dock stands 30 px above the display edge in an installed app and 84 px in a Safari tab, as the design says (it stood 10 px higher).
<!-- changelog.d/phone-dock-shadow-edge.md -->
- On iPhone, the dock's shadow no longer greys the bottom edge of the screen
  in the light theme.
<!-- changelog.d/phone-docs-editor.md -->
- Tasks inside documents. A checklist item can be a real Needt task: type `[]`
  (no space inside) or choose Task from the `/` menu or the phone bar&apos;s
  block menu. It gets a Task with the page as its origin as soon as it has
  words (in the page&apos;s project when it has one), so it shows up in Today,
  Tasks and the project. Ticking the item completes the task and completing the
  task ticks the item; the date chip at the end of the line is the task&apos;s
  due date; renaming either renames both. Taking the item out of the page asks
  whether to delete the task too or keep it. `[ ] ` and `[x] ` still make a
  plain checklist item. The old Task block is now Task link.
- The phone editing bar above the keyboard holds a block type menu (Text,
  Headings, lists, Task, Toggle, Callout, Quote, Code, Divider, Image, Table),
  bold, italic, underline, strikethrough, link, colour and highlight, indent
  and outdent, undo and redo, Insert and a button that puts the keyboard away.
  It rides on the keyboard from the visual viewport without waiting a frame,
  ignores the overshoot of a dragged page and a zoomed page, so it no longer
  jumps while the page scrolls, and it now sits above the dock at rest.
- The `/` menu puts the entries named by what you typed first (`/task` lands
  on Task, not Checklist).
- Export as Markdown and Export as PDF in the document card menu on the phone
  and the desktop (PDF opens the page and prints it).
<!-- changelog.d/phone-docs-menu.md -->
- Docs on the phone and the desktop card menu share one set of actions: Rename,
  Move to project, Pin or Unpin, Duplicate (a copy with the same text, cover,
  style and project), Share (the Share sheet, with the publish switch), Copy
  link and Move to Trash, each with Undo. On the phone they are the
  long-press sheet. Cards below the fold draw their page lazily and their cover
  pictures load lazily.
- Tasks can name the page they came from: `originPageId` on `GET`, `POST` and
  `PUT /api/tasks`, `GET` and `POST /api/connect/tasks`, and `originPageId` on
  `needt_list`, `needt_create_task` and `needt_update_task`. `GET /api/tasks`
  takes `?originPageId=<page id>` to list the tasks from one page. It is a
  shorthand for the existing `originKind: "doc"` and `originId` columns, so
  nothing in the schema changes.
<!-- changelog.d/phone-document-scroll.md -->
- Phone: pages scroll like an ordinary web page instead of inside a fixed
  frame, so Safari 26 no longer paints a solid band behind the status bar and
  the bottom toolbar, in the browser and in the installed app. The page colour
  is the theme's ground and changes the moment the theme does; content runs
  under both bars, the dock floats above the bottom, and a sheet holds the page
  still and gives back its scroll position.
<!-- changelog.d/phone-edge-blur.md -->
- Phone (iPhone Safari and the installed app): the top and bottom blur now run
  to the display edge, so rows scrolled under the status bar are blurred
  instead of showing as a sharp sliver; only the tinted layers still stop a few
  pixels short so the bars keep the page colour.
<!-- changelog.d/phone-edge-layers.md -->
Phone: the blurred band at the top and the fog at the bottom reach the very screen edge again (behind the status bar and the Safari toolbar), and the pull-down plate no longer paints a band at the top. Full-screen fixed layers now stand 8 px in from the edges so Safari 26 has nothing to tint its bars from.
<!-- changelog.d/phone-focus-button-bottom-strip.md -->
- iPhone: a round Focus button with a time-left ring appears left of the dock while a focus session runs (a paused session shows a quiet ring); tapping it opens the Focus sheet. The bottom fog now reaches the display edge, so no strip shows under the dock.
<!-- changelog.d/phone-focus-dock-row.md -->
- Phone: while a focus session runs, the dock becomes the focus row from the
  design: a 64 px focus button left of a four-slot pill, centred, with no New
  task button (hold the pill to add a task), so the ring never runs off a
  narrow screen or into the pill.
<!-- changelog.d/phone-fog-dots-drift.md -->
Phone: the fog dots under the dock move again (the live check no longer depends on an intersection observer reading a zero-height fixed box).
<!-- changelog.d/phone-home-done-card.md -->
- Phone Home, finished day: the headline stays on one line with End day and See tomorrow under it, and "Pull something in" lists the next tasks in the same rows as the rest of Home, with a small Today action.
<!-- changelog.d/phone-native-feel.md -->
- Home on the phone showed yesterday's date after the installed app had been asleep, and its "week 42" disagreed with the calendar's "week 41". The day and the week number now come from one place, follow your time zone and week start, and are re-read whenever the app comes back to the screen.
- The phone no longer shows a lighter strip under the bottom bar: the page behind the screen, the browser bar colour and the app's splash colour are the screen's own colour, in light and dark.
- "All done for today" is no longer shown while an Inbox or overdue task is still open.
- Swipe a task row right to complete it, or left to reveal Schedule and Delete (Home, Tasks, projects). The row follows your finger with a rubber band, and Android phones give a short buzz at the threshold and on complete.
- Share to Needt: on Android, share text, a link or a picture from any app to Needt and save it as a task, a doc or a moodboard item, in a project. iPhone does not let a home-screen app receive shares.
- Long-press the app icon for New task, Today and Ask Needt. The icon badge shows today's open tasks plus overdue ones where the device supports it.
<!-- changelog.d/phone-nothing-fixed-at-top.md -->
- On the phone nothing is pinned to the top of the screen any more: the blur
  band and the small title that replaced the large one while you scrolled are
  gone. Content scrolls under the status bar and Safari's bar, and the large
  title scrolls away with the page.
<!-- changelog.d/phone-plan-start-trial.md -->
- The phone Plan page now offers "Start 14-day free trial" to a Free account
  that has not had its trial yet, as the desktop Plan section does.
<!-- changelog.d/phone-reader-ground.md -->
- On iPhone, an open document without a backdrop no longer shows a band at
  the top: the page behind the status bar takes the document's paper colour.
<!-- changelog.d/phone-safari-bar-layout.md -->
- Phone in a Safari tab: the header now sits right under Safari's bar instead
  of below an empty strip, and with Safari's address bar at the top (Settings >
  Apps > Safari > Tabs > Top) the dock sits at the bottom of the screen instead
  of floating above it. The dock and the header no longer shift a moment after
  the page loads.
<!-- changelog.d/phone-standalone-navigation.md -->
Phone: a test now fails the build if the app navigates to itself by an absolute or http:// URL, or opens an app path in a new window (the way an installed iPhone app drops into Safari's in-app browser).
<!-- changelog.d/phone-standalone-sheet-height.md -->
- In the installed iPhone app, a sheet opened from a link (such as Settings)
  covers the whole screen again instead of stopping above the bottom.
<!-- changelog.d/phone-top-band-2.md -->
Phone: the collapsed header now sits on a full-strength 24 px blur with a 78% ground tint from the display edge down to 16 px below it, then a 24 px fade, so no row text is legible behind the title. The band is sized from the header's own height.
<!-- changelog.d/phone-top-band.md -->
Phone: the installed app now declares apple-mobile-web-app-capable so iOS honours the translucent status bar (content and the blurred band reach the top edge), and the top band is one soft tint instead of a solid slab.
<!-- changelog.d/phone-top-one-blur.md -->
- Phone: the top of the screen is one soft blur that fades out under the
  header, with no white sheet, line or glow behind the status bar, in the
  installed app and in Safari.
<!-- changelog.d/phone-viewport-short.md -->
- The installed iPhone app keeps the screen to the very bottom of the display even when iOS reports a viewport shorter than the screen.
<!-- changelog.d/push-notifications-setup.md -->
- Settings → Notifications has a "This device" row: enable notifications from a tap, see whether they are on, blocked, unsupported or need Needt added to the Home Screen (iPhone), and send a test notification. Overdue-task alerts are now pushed to your devices when you are away from the app, and tapping a notification opens the right page in the window you already have open.
<!-- changelog.d/quick-add-parse.md -->
- Quick-add parsing for every surface (Pro): `POST /api/quick-add/parse` turns "Call Anna tomorrow at
  3pm 30m #Work !high" into a title, a start or deadline in your time zone, a duration, a priority
  and a project. Dates are read in nine languages, including Russian and Ukrainian.
<!-- changelog.d/review-1019-phone-fog-streak-starter-gap.md -->
- Phone: the dotted fog behind the dock now reaches the bottom of the display
  on phones with a home indicator instead of stopping about 40 px above it.
- Phone: the Starter game card no longer touches the card above it on Home.
- Home: the week card says "1 day" for a one-day streak, not "1 days".
<!-- changelog.d/root-to-today.md -->
- Opening the bare app address while signed in now lands on Today, the same
  Home the dock, the installed app and onboarding use.
<!-- changelog.d/route-error-boundaries.md -->
- A screen that fails to render now shows a small card inside the app with
  Retry and Go home, instead of taking over the whole page.
<!-- changelog.d/safari-probe-focus-fog.md -->
Safari probe: also shoots the phone Focus button (running, paused, ending, light and dark) and checks that the fog dots move.
<!-- changelog.d/safari-probe-standalone.md -->
- Safari probe: also installs the app to the simulator Home Screen (Share, Add to Home Screen) and shoots it standalone, light and dark, with an edge-band check of the top and bottom rows and a check for Safari's in-app chrome after navigating.
<!-- changelog.d/scheduler-all-calendars-caldav-sweep.md -->
- Every enabled calendar now blocks scheduling, including the Needt calendar
  that MCP-created events land in and calendars added after the settings were
  saved; only a calendar you switch off is ignored. Planned tasks no longer sit
  inside such an event.
- CalDAV calendars sync every 15 minutes in the background, and a calendar that
  keeps failing shows "Calendar sync failing" in Connections instead of going
  quiet. A finished sync job no longer stops the next one from being queued.
<!-- changelog.d/scheduler-clock-change-hang.md -->
- Fixed the scheduler hanging forever when a search reached a 23- or 25-hour clock-change day (for example 25 Oct 2026 in Europe). Auto-scheduling and Plan my day now step by calendar day, and every day-by-day search stops after 400 days.
<!-- changelog.d/scheduler-local-hours.md -->
- Auto-scheduling now reads high-energy hours and "morning / afternoon / evening" preferences on
  your own clock. Before, they were compared in the server's time zone, so heavy tasks could land
  hours away from your energy window.
<!-- changelog.d/scheduler-user-timezone.md -->
- Planned tasks now land inside your own work hours: the scheduler read hours, weekdays, overrides and the capacity numbers in server time (UTC), so 09:00-17:00 in Zurich was planned as 11:00-19:00. "Today" in the AI day summary follows your time zone too.
<!-- changelog.d/scheduling-work-hours-busy.md -->
- A task with a hard deadline is never placed outside your work hours any more; if it does not fit before the deadline it stays unplaced and is reported as missing the deadline.
- Calendar events marked free or transparent, and events whose invitation you declined, no longer block scheduling or count as busy time in the week capacity.
- Signing in on a browser another account used for notifications moves that browser's push subscription to you instead of failing.
<!-- changelog.d/security-authz-hardening-2026-10-21.md -->
- Security hardening: a connector or OAuth token with read access only can no
  longer change data through the operations API (`/api/connect/ops`) or undo
  actions; writes there need the write scope, mail operations need the mail
  scope, and writes over `/api/connect` share the 30-a-minute limit that
  `/api/mcp` already had. Creating or editing a task accepts only the task's
  own fields, so a request can no longer attach reminders or other records to
  it, and a task can only wait on a task of its own workspace. A focus
  session can only be started on, book time to, or finish a task in the
  workspace you are in, and a viewer can run the timer but not touch a task
  through it. A viewer can no longer have the AI assistant create tasks,
  subtasks, mail follow-ups or page proposals.
<!-- changelog.d/security-quick-wins-2026-10-21.md -->
- Security hardening: files on a shared page link no longer run script (SVG
  and other non-picture files download, and every response is sandboxed),
  uploads keep their type only for PNG, JPEG, GIF, WebP and AVIF, task titles
  and names are escaped in reminder and password-reset emails, and password
  reset links are stored hashed. A reset link requested before this update
  stops working; request a new one.
<!-- changelog.d/settings-desktop-group.md -->
- Settings has a Desktop group (App, Island, Focus, Widgets, Siri & Shortcuts) for the Mac app, with a live island preview. Outside the Mac app each section points to the Mac app. The Dock badge can be turned off.
<!-- changelog.d/settings-widgets-preview.md -->
- Settings -> Desktop -> Widgets now has a live preview: pick a style tile and the Today medium widget appears in that style, light and dark, with your next tasks for today (a sample day until you plan some).
<!-- changelog.d/shell-motion-smooth.md -->
- Closing and opening the left sidebar no longer stutters, and the Ask panel
  keeps its 220ms glide: the page now slides or is revealed with a transform
  instead of re-laying-out on every frame.
<!-- changelog.d/ssrf-outbound-targets.md -->
- Addresses you enter for outbound connections now have to be public: the connector webhook URL, a custom AI endpoint, CalDAV and IMAP servers, and web-push endpoints are refused when they point at (or resolve to) a private, loopback, link-local or other internal address. Public servers keep working over http or https and on any port.
<!-- changelog.d/starter-game-data.md -->
- Starter game, part 1 (data and API): new `GET/PATCH /api/starter-game`
  (hidden for 7 days or for good, fewer than five open tasks), the one agent
  request `POST /api/starter-game/plan` and `POST /api/starter-game/create`,
  which creates the sorted tasks, habits and projects as one undoable action
  (new op `starter.create`). Pro, Lifetime and trial only.
<!-- changelog.d/starter-game-entry.md -->
- Starter game, part 2 (entry card): with fewer than five open tasks, Home,
  Calendar and Tasks show "Sort out your day", "Fill your week" or "Empty your
  head" in place of the empty state. "Not now" hides it for 7 days, "Don't show
  again" for good. On Free it wears PRO and "Try with Pro" opens the plans.
<!-- changelog.d/starter-game-flow.md -->
- Starter game, part 3 (the game): Start opens three questions (what you do,
  what is burning this week with dictation where the browser can listen, what you
  want to do regularly). One agent request turns the answers into 12 to 16 tiles
  that you drag into Today, This week, Habit or Project; tap a tile to edit it.
  Create makes the tasks, habits and projects (each with a first step) in one
  undoable action, and the summary offers Plan my day with Undo.
<!-- changelog.d/task-complete-animation.md -->
- Ticking a task is no longer abrupt. The box fills with a small pop, the
  title is struck through with a line drawn across it, and, depending on
  Completed tasks in the task view, the row stays or folds away after about a
  second while the rows below slide up. Undo is in the notice that follows.
  The same completion plays on Home, Tasks, project pages and the Calendar
  (and the phone's check pops too); with reduced motion on, rows leave at once.
<!-- changelog.d/task-complete-exit.md -->
- Ticking a task on Home now finishes smoothly: the check pops, the title is
  struck, then the row folds away and the list closes the gap (about 0.9 s in
  all). This includes Overdue, Inbox and the Next up card, whose rows used to
  vanish at once. Undo inside that moment keeps the row. A task closed from
  another device or through the API folds the same way, without the pop.
  Reduce Motion turns it all off.
<!-- changelog.d/task-view-settings.md -->
- A gear at the top right of Home, Tasks and the Calendar opens the task view:
  one setting for every task list. Choose whether completed tasks leave at
  once, stay until the end of the day or stay; which details a row shows
  (subtasks, duration, project); how lists are sorted (time, priority, due
  date) and, on Tasks, grouped (date, project, priority); and whether overdue
  tasks come first. It is saved in your settings (`prefs.taskView`) and can be
  read and written through `/api/user-settings`.
<!-- changelog.d/turbopack-highlight.md -->
- Dev: `next dev --turbopack` builds again; the Find match colour is injected by
  the Find panel instead of a `::highlight()` rule Turbopack's CSS parser rejects.
<!-- changelog.d/unused-dependencies.md -->
- Removed 19 dependencies nothing imports any more (react-hook-form,
  react-datepicker, react-aria, axios, @azure/msal-node, and others left over
  from the old UI).
<!-- changelog.d/whats-new-help.md -->
- What's new lists the latest changes from the changelog, day by day, newest
  first, instead of four fixed notes. Open it from the account menu, the ?
  menu or Settings, About (on the phone, Settings, About, What's new). The
  avatar carries a dot while there are changes you have not opened; opening
  the list clears it on every device. The list is also at GET /api/whats-new.
- Help: the account menu, the ? menu and Settings, About (desktop and phone)
  have a Help row that opens the guides at needt.app/learn in a new tab. The
  account menu also lists Keyboard shortcuts.
<!-- changelog.d/whats-new-releases.md -->
- What's new keeps showing the latest release after a release day, dated by
  the release, followed by everything added since.
<!-- changelog.d/widgets-layout-audit.md -->
- Widgets: the Sky sun no longer sits on top of the "left" label, the task list or the focus title; Sky task titles get more room. Pixel and Noir grids no longer run past the widget margin, Noir task titles stay readable in the light theme, the Noir and Rim small widgets no longer cut titles mid-word, the Cat Today panel reaches the edge, and the Next timeline blocks keep their full titles.
<!-- /changelog.d -->

- Mac app, island v3: the hover peek is now exactly 480 x 108 (and Standby
  480 x 88) as in the design, with the 0.26 s anticipation stretch before it;
  the AirPods moment shows the battery level when macOS lists it (otherwise
  just "Connected"); the Music moment also fires when the song changes; the
  Volume HUD page follows the system volume (direct download only); the Tools
  page has a Weather tile that needs a signed build (shows "Needs signing"
  otherwise).
- iPhone: widgets for Today (small, medium, large), Next event, Focus timer,
  Habits (Free shows 3) and Quick add, Lock Screen widgets, and Controls for
  Add task and Start focus; each widget has eight looks you pick in its Edit
  menu (D · Ink by default; tinted, clear and Lock Screen always use the Ink
  layout); the focus block shows as a Live Activity (compact ring and timer,
  one outlined Pause, ends with the run); titles stay off the Lock Screen
  unless you turn "Show titles on Lock Screen" on.
- Mac app: widgets on the desktop and in Notification Center (Today in small,
  medium, large and extra large; Next event, Focus timer, Habits, Quick add)
  with eight looks to pick per widget.
- Mac app, island v3 (Pro): one black shape that morphs between states (on
  plan, manual change, focus running, warning, standby, peek, open, moments),
  with Today / Week / Focus and a modules grid. Reads `prefs.island` from the
  user settings. `NeedtKit` gains `IslandPrefs`, `IslandCadence`,
  `IslandOverrides` and `IslandWeek`. Rolls back with the `needtIslandV3`
  default.

- Mac app: the traffic lights are centred on the page's sidebar toggle (the
  page reports its top-bar centre) and the toggle starts 16 pt after the zoom
  button.
- Mac app: the notch island is part of Needt (Pro). Focus, Next (next task and
  event) and Add (quick add) sit before Music and Files; focus can be paused or
  ended from the notch ("Done 5 min early"). On a Mac without a notch the
  island is a black pill at the top centre. Settings has an Island pane
  (on/off, modules and their order, open on hover or click, displays, sounds
  and haptics); on Free the pane is read-only. The App Store build has no
  private interfaces (no volume or brightness HUD, no system sensors) and plays
  Apple Music and Spotify only. The direct-download build is no longer
  sandboxed. The island is derived from Atoll and boring.notch (GPL v3), so the
  source of the Mac app is offered under GPL v3.
- Phone: the pull-down plate (search and quick add from the top of a screen) is
  gone; pages scroll normally. The dock (pill, + and focus buttons) sits 30 px
  above the screen edge, 84 px in a Safari tab where the tab bar floats under it.
- Phone: the top and bottom edges follow the new phone-shell design. The
  collapsed header is the place icon and title, centred, over a three-step
  blur that fades in as you scroll; the fog under the dock is 128 px (deeper
  in a Safari tab).
- Mac app: Siri, Spotlight and Shortcuts actions (add task, complete task,
  start and end focus, what's today, what's next, replan day, log habit) and
  your open tasks in Spotlight; a Needt focus can run a Shortcut you choose to
  switch a macOS Focus on or off, and a macOS Focus can suggest or start the
  focus task (Focus filter); the menu bar shows "24:10 · task" only while a
  focus runs; "Add to Needt" in the Share menu turns a link or text into a
  task; offline, the menu shows the last day read-only ("Offline · updated
  14:05") and writes say why they are off; the app is sandboxed and has a Mac
  App Store configuration without the updater.
- Place switches show the skeleton of the place being opened (after 150 ms, in
  the page's own slot, not a full-screen card) instead of the old screen frozen
  while the server answers; desktop and phone, still under reduced motion.
- Phone document editor: the format bar is a floating pill with side margins
  above the keyboard, the page no longer springs when you tap it, and typing
  does less work (no relayout per keyboard frame, no blur re-render of the
  backdrop while editing, one scroll read per frame).
- Installed iPhone app: manifest no longer offers `minimal-ui`, and server redirects are always https, so iOS has no reason to wrap the app in the Safari controller.
- Mac app, rebuilt natively (Swift, `apps/macos`): the same Needt interface in
  a native window with a transparent title bar, a menu-bar item (focus
  countdown, today's next tasks), a Dock badge for overdue tasks, a global
  quick add on Shift-Command-Space, native notifications and automatic
  updates (Sparkle, switched on once signed). The Tauri build remains for
  Windows.
- iOS app: the Midnight icon is the app icon (with iOS 18 dark and tinted
  looks), the other twelve are alternate icons you pick in Settings →
  Appearance, the launch screen is the ground colour with the Midnight mark,
  and sign-in is Apple, then Google, then email, done in the system browser
  sheet and handed back with a one-time code.
- Desktop app, chrome redone to the new design: the start window (440 x 520)
  shows each step of the browser sign-in (browser opened, signing you in, link
  expired); on a Mac the sidebar lets the desktop show through (vibrancy; the
  content stays opaque) and the sidebar toggle sits next to the traffic lights;
  the menu-bar item is the Needt mark alone until a focus runs, then it shows
  the time left, and its menu can pause or end the focus; the Dock badge counts
  overdue tasks only; Quick add is a borderless card above other apps (Enter
  adds, Cmd+Enter adds and opens, Tab switches task, event, doc, Esc closes);
  the offline page follows the new design and retries every 10 seconds. Nothing
  changes in the browser.
- Focus and Done: ticking a task during its focus ends the focus. The notice
  "Done 12 min early" now has Undo (it opens the task again; the focus itself is
  not resumed, start a new one), and Home's time-left bar shows the returned
  minutes as a green slice right after now for 2.4 s. "Do for the full time" is
  a switch with an Auto tag: habits and repeating tasks are always full time
  (no stored choice turns it off), a one-off defaults to off. Ticking a
  full-time task early asks "N min left" with Keep going (primary) and End now.
  The phone focus button shows whole minutes, a dashed ring with two bars when
  paused, and a warm breathing ring in the last 2 minutes.

- Desktop app (macOS, Windows): it opens on its own start window instead of a
  web page, and signing in happens in your browser (so Google works) and
  returns to the app with a one-time code; the app then opens straight to
  Today and remembers you. On a Mac the window now uses the native title bar
  inset over Needt's own top bar, with a native menu (New task, Quick add,
  Today, Calendar, Tasks, Docs, Toggle sidebar, Reload), a menu-bar menu with
  today's next three tasks and a running focus session, and a Dock badge with
  today's open count. Starting with no connection shows an offline page that
  returns by itself. Nothing changes in the browser.

- Phone, Safari 26: the status bar and the bottom toolbar now take the colour of
  the in-app theme (not the opposite one, not a stale one) and change the moment
  the theme does. The ground also runs under both bars.

- The notifications bell now shows real activity: what Needt or a connected
  agent did, comments and shares on your pages, a calendar that needs
  reconnecting, finished imports and nudges, with unread dots and Mark all as
  read. Reminders lists upcoming task reminders and due or overdue tasks. The
  same feed is available at `GET /api/connect/notifications` for connector
  tokens.
- Opening the Ask panel on desktop no longer stutters. The page beside the
  panel used to be re-laid-out on every frame of a 220 ms width animation
  while the panel was also mounting, and the whole shell re-rendered on open.
  Now the dock slot changes width in one step and reads the open flag itself,
  the card enters with transform and opacity on its own layer (hinted only
  while it moves, no glass blur in flight), and a long thread mounts its
  latest lines first and the older ones after the entrance.
- Connecting Needt from claude.ai works again: the sign-in page no longer
  rejects a client that also lists grant types Needt does not issue (Claude
  lists jwt-bearer), and only requires authorization_code.
- Connecting Gmail or Outlook Mail no longer sends the browser to the
  container address (`0.0.0.0:3000`): the mail and integration callbacks and
  checkout build their URLs from `NEXTAUTH_URL`. A connected Gmail now shows as
  Connected on the Connections screen (the card looked for provider `google`
  while the mailbox reports `gmail`), and returning to the Mailbox says the
  account is connected.
- Document text is readable on every page style, in Light, Dark and Time: the
  ink now always clears 4.5:1 on the page (whatever Text colour was chosen),
  and a page whose colours could not be read yet no longer starts without a
  page colour. A test checks every page x text colour x theme side.
- Right-click inside a document opens Needt's own menu: for selected text (Cut,
  Copy, Paste, Turn into, Bold, Italic, Link, Ask Needt about this, Comment when
  the page has comments) and for a block (Turn into, Duplicate, Move up/down,
  Copy link, Delete). Shift + right-click still opens the browser's menu. On a
  phone, tap the block's grip.
- Documents on a phone: the editing toolbar rides on the keyboard (with Done),
  the "/" block sheet sits above it, page text always selects, checklist boxes
  have a 44px tap area, and the caret scrolls clear of the toolbar.

- Documents no longer lag while you type. Three things ran on every keystroke:
  the whole page was turned into JSON and written to local storage, a
  collaborator's caret move (which fires on each of your keystrokes) re-rendered
  the whole editor and re-applied its configuration, and the word count read the
  page's text. The page is now written to the recovery draft and saved after a
  short pause (and on closing the tab), and the editor's configuration is built once.
- Trash now keeps its 30-day promise: the worker deletes tasks, pages and
  moodboards that have sat in Trash for 30 days. Tasks can be deleted for good
  (`DELETE /api/tasks/:id?permanent=true`, Trash only), Empty Trash takes them
  too, and the phone Trash has Restore all.
- Document previews: pinned documents in the sidebar and the rows of the Docs
  list wear the page's face with its title and first lines (not a generic
  icon), and a document you just edited (a checklist, say) shows its lines in the
  Docs grid straight away instead of staying blank until the list reloads.
- A document's "Dark" or "Light" text can no longer make the page unreadable:
  where that ink cannot be read on the page in the current theme (light text on
  the white page in Light, dark text on the grey page in Dark), the page uses Auto
  ink for that theme.

## [0.9.0] — 2025-12-31 (pre-launch, inherited: the hand-written entries from the FluidCalendar fork to mid-October 2026; dated 2025-12-31 so What's new skips it)

- The app host is no longer indexed by search engines: every response carries
  `X-Robots-Tag: noindex, nofollow` (now set in middleware too), every page has
  a robots noindex meta tag, and robots.txt lets crawlers reach the public
  entry pages (sign-in, privacy, terms, subprocessors) so they can see it.
- The AI tools tab no longer needs `NEXT_PUBLIC_MCP_OAUTH_URL`: the OAuth host defaults to `https://mcp.needt.app/mcp` (that variable is baked in by CI, not Coolify, so setting it in Coolify had no effect).
- Mail is read-only. Connecting Gmail asks only for `gmail.readonly` and
  Outlook only for `Mail.Read`; Needt no longer changes anything in a
  mailbox. Marking read and archiving are kept in Needt only and survive
  syncs. Accounts connected earlier keep working without reconnecting.

- Admin operations lists every external service — billing, email, alerts,
  push, OAuth, hosted AI, Sentry, collaboration, Redis, webhooks, cron — as
  configured or not, with a live check for Redis and the collaboration
  server and a button that sends one Sentry test event. Never a secret value.
- Focus can be ended early in one step. End session is always on the controls
  (End break during a break); it asks once, "End now? 12 min focused so far.",
  and ends at once. There is no 5-second lock any more: the server lets a
  normal session go immediately (strict Pro modes keep their wait and say so),
  Esc or Keep going backs out of the question, and the End view shows the
  minutes actually focused. Minutes from sessions ended early now count in
  "focused today", the week and the task's time; breaks never do; a session
  found hours after its clock ran out is booked at its planned length. The
  week's bars follow the person's own day, and starting while a session runs
  answers 409 instead of 500.
- Ask Needt works on the phone. The sheet no longer says it is not connected:
  it talks to the same assistant as the desktop panel, with the same thread
  (one conversation, kept when the window crosses 700 px), six suggestions that
  follow what you are looking at (a doc, a task, the day), Thinking, streaming
  and Stop, Confirm for actions it asks about, and the same reasons when the
  plan or the monthly allowance does not cover it, with See plans on Free.
  Attach is drawn and off.
- No more dark flash on first paint for a Light choice (or a Time choice at
  night, or System on a dark OS). The server reads the saved theme and accent
  and renders the page in them, a pre-paint script settles System and Time,
  and `color-scheme`, `theme-color` and the page behind the app follow the
  theme from the first byte. Your choice is unchanged.

- Ask Needt (⌘J) now opens as a full-height panel docked on the right of the
  window (a sheet over a scrim below 1100 px), as in the design: a context chip
  for the task, doc or day it is looking at, a greeting by name, six suggestion
  cards that follow that context, `/` commands, `@` mentions and ↑ to edit your
  last line. Attachments are shown but disabled until the AI backend takes files.
- Proactive nudges now reach the app: a painted-sky tip above the Ask pill
  ("2 hours opened up … Fill it") shows what the nudge job noticed. Fill it runs
  the scheduler (preview, then apply) and the notice that follows has Undo. The
  nudge job also detects free stretches of two hours or more (new `FREE_TIME`
  nudge, Pro). The bell lists the latest nudges, marks them read and has "Mark
  all as read" and "Reload".
- `GET /api/notifications?peek=1` reads nudges without marking them delivered;
  `PATCH /api/notifications` accepts `{ "all": true }`.

- Connections: every connector said "Not set up on this server yet." The
  catalog looked for credentials in the environment only (and for
  `OUTLOOK_CLIENT_ID`, which nothing else reads), so a server configured in
  System settings still reported nothing as set up, and the mailboxes claimed to
  be ready regardless. Google and Microsoft now come from the same lookup as the
  sign-in routes, a mailbox is ready when its calendar is, and the Composio apps
  need `COMPOSIO_API_KEY`. The admin is told what to add; everyone else no
  longer sees a connector the server cannot start (and Settings → Import does
  the same for Notion and Todoist). What each connector needs:
  `docs/operations/connectors-status.md`.
- Connections: a refused Google or Outlook start (calendar or mailbox limit) is
  now a notice instead of a raw JSON page, and cancelling on an app's consent
  page no longer marks it connected.
- Connect Apple / iCloud: rebuilt to the connect dialog. One title, a one-line
  lead, four compact rows on the 105 / 32 form row, one outcome line, Test
  connection · Cancel · Connect. It no longer shows a card inside the sheet,
  required asterisks, stacked help text or a browser alert, and password
  managers no longer draw over the fields.
- Document rail, desktop: the left panel has the prototype's four tabs. Tasks in
  this document lists every to-do in the page's text under the heading it sits
  in, and every task the page links to; ticking a row ticks the box in the text,
  a row scrolls to it, and completed ones are hidden until asked for. Files lists
  what is attached to the page (pictures as a grid, the rest as rows with kind
  and size), and the plus adds a file (10 MB at most).
- Document covers: the Style panel (desktop) and Page Style (phone, None / Art /
  Image) offer the eight drawn cover arts. An art is stored as `art:<theme>` in
  the page's `coverUrl` and drawn from the theme's colours, in the document, the
  Documents grid and the phone reader. The public page does not draw it yet.
- Templates, desktop and phone: the six templates that come with Needt (Daily
  note, Weekly review, Product drop, Meeting notes, Resale listing, Project
  brief) are listed after your own, each with a miniature of its blocks. Use
  makes a real page with the template's blocks and page colour through
  `POST /api/pages` and `PUT /api/pages/:id/blocks`, opens it, and Undo sends it
  to Trash. Page colours are free ones, so a template works on every plan.
- Trash, desktop and phone: pages are listed (with Restore and Undo), and pages
  and moodboards can be deleted for good, one at a time or with Empty Trash.
  Both ask first in a dialog (a sheet on the phone) that says there is no Undo,
  and Empty Trash says how many tasks stay (tasks still have no permanent
  delete). New `DELETE /api/pages/:id?permanent=true` deletes a page that is
  already in Trash; a live page is refused with 409.
- Projects, desktop and phone: a task with subtasks is drawn as a chain. Its
  first step is on top, the subtasks follow in the order they are done, and the
  task itself comes last as the closing step ("Last step · 1 of 3 done"); a
  hairline joins the checks. Ticking the last open subtask closes the task with
  it in one write and one Undo. A task that waits on an open task comes after
  it, says "Waits on ..." under its row, and on the phone cannot be swiped to
  tomorrow or dragged to another day.
- Ask Needt and Needt MCP break work into subtasks. `create_task` /
  `needt_create_task` take `entry` (the first small step), `subtasks` in order,
  `projectId` and `dependsOnId`, so a task and its steps arrive in one call;
  new `add_subtasks` / `needt_add_subtasks` and `complete_subtask` /
  `needt_complete_subtask` tools (the answer says when every subtask is done and
  the task itself is the last step); `needt_update_task` also sets `entry` and
  `dependsOnId` (loops refused); `needt_get` / `needt_list` return a task's
  subtasks. The brain-dump parser and Quick add turn "entry" and "subtasks" into
  the task's first step and subtasks. Tool descriptions and the assistant's
  system prompt tell models to put the entry step first and the task last.
  `docs/connector-api.md` lists the new tools and fields.
- The "Add a task" line inside a project no longer draws two focus rings: one
  ring, a quiet hover, a fade instead of a jump, "Enter to add" always in place
  so the line does not reflow while you type, an IME candidate's Enter does not
  add, Esc clears and leaves.
- Task dialog: an empty Project chip reads "Project" instead of "+ Project";
  the picker only chooses an existing project, and projects are made on
  Projects.

- The Focus window is built (new design): the sidebar pill, ⌘⇧F, Home's Start
  focus and a task's Start focus open it — setup (purpose, 25/50/90/custom
  length, task, ambient sound), the running clock with Pause, +5 min and Stop
  (ending early takes two presses a few seconds apart), and the End view with
  what next. The session lives on the server, so it survives a reload and the
  window crossing to the phone layout; the pill shows the clock and ring, the
  tab title shows the time left, and Start focus says "Focus started · 25 min
  on “task”". On the phone it is a full sheet. Ambient sound and "Hide other
  tasks" are remembered but do nothing yet.
- The app has its own icon: the dark Needt tile in the browser tab, the
  installed app, the home-screen touch icon and notifications, so an app tab is
  told apart from a needt.app tab at a glance.
- Browser tabs name the section you are in and nothing else: Home, Calendar,
  Tasks, Docs, Mailbox, Projects, Moodboards, Habits, Templates, Shared, Trash,
  Connections, Settings and so on. A document, moodboard or project shows its
  own name.
- Adding a task from the v3 quick-add no longer fails with "Could not create the task":
  `POST /api/tasks` now opens the task as `todo` when the request names no status.
- Connections › AI tools is now real (Pro): one card per AI tool with numbered
  setup steps, a one-click access token (shown once, ready-to-copy
  `claude mcp add` command, rotating disconnects agents) and the apps signed in
  through Needt MCP with Disconnect; desktop and phone. Claude, ChatGPT and
  Perplexity stay "opens soon" until `NEXT_PUBLIC_MCP_OAUTH_URL` is set.
- Desktop shell: sidebar tiles, menu rows and other button-like links no longer
  underline on hover or focus (keyboard focus keeps its ring). Tooltips are
  Craft-style: they appear after about 0.6 s, open at once when you move to a
  neighbouring one, fade in 120 ms, go away on press or scroll, and show the
  shortcut at the right (for example "Toggle sidebar visibility" with the key
  in a muted badge). The browser's own `title` tooltips in the shell use the
  same look. The Help menu gains Report a problem (sends to the bug reports),
  the Needt Pro card shows above the sidebar footer for Free accounts, and an
  Import button (Notion, Todoist) appears beside Focus when imports are on.
- Bug reports no longer default to a public GitHub repository: the GitHub copy is
  sent only when both `GITHUB_BUG_REPORT_TOKEN` and `GITHUB_BUG_REPORT_REPO` are set.
- The Time theme now colours the page background too: in the evening and early
  morning the background stayed Dark-grey while the controls followed Time.
- Remote MCP: new write tools `needt_update_task`, `needt_complete_task`,
  `needt_create_event`, `needt_create_page`, `needt_append_page` and
  `needt_log_habit`, and `moodboard` in `needt_list`/`needt_get`. They use the
  same task, page, habit and calendar services as the app, inside the
  workspace the connection may act in.
- Connect Needt to claude.ai, ChatGPT or Claude Code without pasting a token:
  `https://mcp.needt.app/mcp` signs you in through Needt (OAuth 2.1 with
  PKCE). You choose what the app may do — read, write, and mail as a
  separate tick — and which workspace it is limited to; Settings ›
  Connected apps lists every app and disconnects it at once.
- The installed phone app now feels native: no pull-to-refresh or rubber-band
  bounce, no pinch or double-tap zoom, full-bleed under the notch and home
  indicator, and PNG home-screen icons for iOS. Disabling zoom reduces accessibility; this was a deliberate choice.
- The product line is now "Needt: Everything you're working on, in one place" in
  the page title, link previews, the installed app name and the README.
- The new Needt icon is now the browser tab icon, the home-screen icon (iOS and
  Android, including a maskable one) and the push-notification icon.
- More ways to sign in: Apple, GitHub, Sign in with ChatGPT, Discord, X and
  LinkedIn join Google and Microsoft. The sign-in and sign-up screens (desktop
  and phone) show Google, Apple and GitHub; "More ways to sign in" reveals the
  rest. A provider shows only once it is configured in System Settings
  (secrets encrypted) or the environment. A provider sign-in joins an existing
  account only on an email the provider verified; otherwise it is refused
  with "sign in the way you did before", and X never joins an existing
  account. Closed registration applies to every provider. Microsoft sign-in
  no longer asks for calendar and task access (the Outlook connection does).
  Owner setup: `docs/operations/sign-in-providers.md`.

- Design v3 for everyone: a migration turns the `design_v3` flag on at a
  100 % rollout, so sign-in, sign-up and password recovery wear the v3
  screens for every visitor and every signed-in person lands in the v3 app.
  A brand-new account (credentials or OAuth) goes on to the v3 first-run
  setup; people who already use Needt go straight to the app. A
  `FeatureFlagOverride` set to false still keeps one person on the old design.
- The pages the reset and confirmation mails open are v3 too, on desktop and
  phone: "Set a new password" (same server rule and rate limits; a dead link
  offers a new one) and "Confirm your email" (confirm on a press, then
  continue to the app; an expired or used link sends a new one).
  `/auth/reset-password` without a token opens sign-in on "Forgot your
  password?".
- Remote MCP: the server is ready for `https://mcp.needt.app/mcp` — the
  host serves only `/mcp` and its OAuth protected-resource metadata, which
  the `401` challenge now points at. Tokens carry scopes (`needt.read`,
  `needt.write`, `mail.read`; a personal token has all three) and a call
  without the scope it needs gets `403 insufficient_scope`. The connector
  routes read the same tokens. New `needt_whoami` tool; every tool takes an
  optional `workspaceId` and says whether it reads or writes. Protocol
  `2025-11-25`; JSON-RPC batches are refused. Limits: 120 calls/min and 30
  writes/min per person, 600 calls/min per IP.
- Claude Code, Claude Desktop and other agents connect to Needt directly at
  `/api/mcp` with the personal access token. They can search, list and read
  tasks, projects, calendars, events, pages, habits and mail, and create and
  change tasks, projects and events. Settings → Personal API shows the URL
  and the one-line `claude mcp add` command. The local stdio server is now a
  thin bridge to the same endpoint, so it gained the restore actions it was
  missing.
- The application at use.needt.app asks not to be indexed: `/robots.txt`
  disallows everything and is readable without signing in, and every response
  carries `X-Robots-Tag: noindex, nofollow`. The worker can ping an external
  uptime monitor (`NEEDT_HEARTBEAT_URL`), and cookieless Umami analytics load
  when `NEXT_PUBLIC_UMAMI_WEBSITE_ID` is set at build time.
- Moodboards (design v3) get the grid logic of the design on desktop and phone.
  A board is a grid of pictures, links, colours and notes: Add (Upload images,
  drop, paste a picture, a link or a hex with ⌘V, Colour, Note), a reference
  opened on the side with a note that saves itself, drag to reorder (hold and
  drag on the phone), "View as guest", Share with View / Edit by email,
  "Anyone with the link" (a read-only page at `/b/<id>/<token>`; turning it off retires that address for good) and Leave
  board. Pictures are shrunk to a JPEG of at most 900 px (1.5 MB at most) before
  upload and stored with the board, with a 200 MB picture total per workspace on
  every plan ("Your workspace's moodboard pictures are full" when it is reached); a pasted link is read server-side for its title and
  picture (https only, nothing private is ever contacted; 30 reads per person per 10
  minutes, then the link is saved as typed). The list sorts by
  Name, Date created or Date updated on the server, a board's Date updated
  moves with every change to it, Trash can Delete forever, and the Pinterest
  row says "Coming soon". The old collaborative canvas stays on the flag-off
  route; with the flag on, what it stored shows on the grid read-only. New API:
  `PATCH /api/moodboards/:id/items` (reorder), `POST …/items/upload`,
  `GET …/assets/:id`, `?sort=&dir=` on the list, `DELETE …?permanent=true`,
  `PUT …/permissions` by email, and Leave through `DELETE …/permissions`.
- Fixed (design_v3, opened document): the document screen now matches the
  prototype at desktop width, light and dark. The top bar shows
  "Documents / title" with the avatar, Insert and Share on the right, and the
  editor's save state and Page options menu (now drawn as a v3 menu); the left
  rail becomes the document's own panel (Contents, Find, a switcher back to the
  places); the page keeps the sheet's measures (760 or 1080 wide, 32px bold
  title that wraps, rule under it in the chosen separator, 16px body, to-do,
  quote, code, table, image and callout blocks); the inspector has Insert (adds
  a block at the cursor), Style (now with Separator Style and the PRO badge)
  and Info (Versions, Numbers); the selection bar and the "/" menu are v3
  surfaces; the editor's own toolbar is not drawn. The title follows the
  breadcrumb and the rail as you type. Free users who tap a Pro style now get
  the paywall sheet.
- Docs: each document card in the grid now shows its page in miniature, as
  the design does: the first blocks (headings, paragraphs, lists, to-dos,
  quotes, callouts, code, dividers, a picture) drawn small on the page's own
  colour. `GET /api/pages` adds a short `preview` to every live page, a list of
  `{ type, text }` rows (at most 8 rows, 120 characters a row, 600 in all;
  plain text, no HTML), read for the whole list with one extra query.
  `?preview=false` leaves it out. Pages you cannot see still return nothing,
  and the trash list has no preview. The phone's Docs cards draw it too.
- Connections (desktop, new design): the screen now sits on the printed sky
  like the rest of the new design: a centred hero ("Sources", a large
  Connections title, one line, and a pill that says "Outlook needs
  reconnecting" when something lost access), centred tabs with the connected
  count, the Connected / All apps switch, the Mail & chat, Calendars, Work and
  Files chips, search, and glass cards in three, two or one column. The
  toolbar stays in view while you scroll. The phone uses the same chips and
  sections.
- Settings (design_v3, desktop sheet): the rail rows have their icons, the
  person is a disc of initials, and the plan card is the printed sky with the
  PRO badge. Appearance shows each theme as the Home screen drawn small
  (System cut down the middle, Time on the diagonal), the nine accent
  swatches show their own colours in the light theme again, the accent card
  has its progress bar, and the Time card says where the sun is. Select
  controls use the up-down chevron. About has What's new, and a paid plan's
  line says when it renews.
- Mailbox (desktop, design v3): the header now matches the design. It always
  shows your accounts as chips (Gmail / Outlook, with a red dot when one needs
  reconnecting), the tabs Needs you / All / Made into tasks plus Sent and
  Drafts, and a New message button. Sent and Drafts are drawn but off ("Sent
  folder isn't synced yet"): Needt does not store those folders, and mail stays
  read-only at the provider. New message opens Gmail's or Outlook's own compose
  window in a new tab (a menu when you have two accounts). With no account
  connected the header no longer goes empty: Gmail and Outlook show as not
  connected, the list says "No mail account connected" with Open Connections,
  and New message waits for an account.
- Templates and Shared now open on the painted-sky banner from the design
  (kicker, big serif title, meta line and up to three of the place's own pages
  on frosted glass) instead of a plain header. Moodboards cards show the first
  three references as a collage (the grey glyph only for an empty board) with
  the reference count, and Free sees "3 boards · Free includes 1 · Upgrade for
  more" and the one "Unlimited moodboards" card. Habits shows "Last four
  months" again (a dot a day, All or one habit) and Free reads "4 habits · Free
  includes 3 · Upgrade for more". `GET /api/moodboards` now also sends
  `itemCount` and `preview` (the first three references), and the new
  `GET /api/habits/history` sends each habit's last 124 days. The painted sky no
  longer turns to night on a light page when the old theme setting is dark.
- Fixed (Notion import review): links, bookmarks, files, images and covers
  keep only `http`, `https`, `mailto` and Needt page addresses (anything else,
  such as `javascript:`, comes in as plain text with a note), and page blocks
  draw a link or image only for such an address. Page files are served with a
  sandbox policy and no content sniffing, and SVG is always a download. The
  importer stores only common file types (anything else is an opaque
  download), downloads only from Notion's own hosts including every redirect,
  and keeps a long run alive for the sweeper.
- Import from Notion (behind the same `imports` feature flag). Settings ->
  Data -> Import sends you to Notion, where you pick the pages and databases
  to share in Notion's own page picker; only those are imported, with their
  tree, text, tables, images and files, and databases with their rows. Links
  between imported pages keep working, a second run updates only what
  changed, and pages Notion could only partly return, blocks Needt cannot
  show and database properties kept as text are listed as notes. Needs
  `NOTION_CLIENT_ID` / `NOTION_CLIENT_SECRET`; additive migration
  `20261012120000_import_asset_entity`.
- Fixed (design_v3): one overdue rule everywhere. A task is overdue only when
  its due date is before today in your time zone; a passed block or a stale
  scheduled time no longer counts, and a task due or scheduled today sits in
  Today. Home, Tasks (desktop and phone), the sidebar badge and Move to today
  now agree. A date-only due date no longer turns overdue a day early west of
  UTC.
- Fixed (design_v3): the Tasks "Today" tab draws its Today group (tasks due or
  scheduled today, timed ones by time), not only Overdue.
- Fixed (design_v3): the sidebar plan pill says "Lifetime" for Lifetime, as
  Settings → Plan does.
- Added (design_v3): "Sign out of all devices" in Settings → Account, on the
  desktop and the phone, with a confirm.
- `/docs` and `/docs/:id` redirect (307) to `/pages`. With design_v3 on,
  an unknown address shows a 404 inside the app instead of the old dark page.
- Fixed: connecting Apple / iCloud (CalDAV) now adds the account's calendars
  and syncs them; before, the account had no calendars and the calendar stayed
  empty. A CalDAV fetch that fails no longer archives every event of the
  calendar, and events the server returns again come back.
- Legal: `/privacy`, `/terms` and a new `/subprocessors` page now publish
  the final Privacy Notice, Terms of Service and subprocessor list in place of
  the draft placeholders. The operator's name, the EU representative, and the
  effective date live in one module, `src/lib/legal/operator.ts`. Settings
  links to all three documents.
- Trial records whose account was deleted are removed two years after the
  trial ended.

- Operations and undo: task, project, schedule, mail-to-task and habit
  changes now have one registry (`src/services/ops`) with strict inputs and
  workspace roles. Every write is logged with its inverse, so it can be undone
  for seven days from `POST /api/agent/actions/:id/undo` (or a whole agent run
  from `/api/agent/runs/:id/undo`). Undo refuses, and says which rows, when
  something changed after the action. External tools list and run the same
  operations through `GET /api/connect/ops` and `POST /api/connect/ops/:name`
  with their connector token. Operations follow the app's rules: default
  reminders on new tasks, read-only tasks in archived projects, no habit
  marks on future days. The log is pruned 30 days after the undo window. The
  chat agent and MCP server move onto it in follow-up changes.

- Fixed: a page in the trash could not be restored. `PATCH /api/pages/:id`
  with `{ "trashed": false }` now brings it back, with its children, blocks
  and files, for anyone who could have trashed it; restoring twice changes
  nothing, and a page whose parent is still in the trash comes back at the
  top level. `GET /api/pages?trashed=true` lists the trash.
- Release: when two merges land close together, the older release run no
  longer asks Coolify for an image the newer run has not pushed yet. It
  stands down and the newer run deploys, so production stops showing failed
  deployments for commits that were already superseded.
- The Google and Outlook OAuth client secrets and the Resend API key saved in
  admin system settings are encrypted at rest (`enc:v1:`), like provider
  tokens. Existing values are encrypted by the same worker-start backfill;
  the admin form still shows the mask and keeps a secret that is not retyped.
- Connected-calendar, mail and task credentials are encrypted at rest:
  Google and Outlook OAuth tokens and CalDAV/iCloud passwords are stored as
  AES-256-GCM (`enc:v1:`) instead of plaintext, as are the sign-in tokens
  NextAuth keeps. Existing rows are encrypted by the worker at start; reads
  accept both forms meanwhile. The session no longer carries the sign-in
  provider's OAuth tokens to the browser, and the worker refuses to start in
  production without `AI_ENCRYPTION_KEY` or `NEXTAUTH_SECRET`.
- Deleting an account now cuts third-party access before the data goes:
  Google and Outlook calendar push channels are stopped, the Google grant is
  revoked at Google, Composio connections are deleted and revoked upstream,
  and Web Push endpoints are dropped. Microsoft and CalDAV credentials, which
  have no revoke call, are deleted with the account. Each step is
  best-effort and never holds the deletion up.
- The one-trial-per-email record no longer keeps the email: it stores a keyed
  hash of the normalized address, and the worker rewrites existing records.
- Signing out from any menu now clears the account's data from the browser —
  every localStorage key except the theme and other device preferences, plus
  the offline cache — after giving changes saved offline a few seconds to
  sync.
- Hosted AI requests are routed only to OpenRouter hosts based in the US or
  the EU, with known hosts elsewhere refused on every request.
- Free keeps three active habits, enforced by the API: creating a fourth, or
  restoring an archived one past the limit, answers 403 `UPGRADE_REQUIRED`.
  Pro, Lifetime and trials are unlimited. Habits above the limit after a
  downgrade stay and stay editable. An archived habit is restored with
  `PATCH /api/habits/:id` and `{ "archived": false }`.
- Security: a session now lasts 30 days and slides — every visit renews it,
  and a device left unused for 30 days is signed out (it was one year).
  Settings › Account has "Sign out of all devices"
  (`POST /api/account/sessions/revoke`), which signs out every device
  including this one; other devices stop working within a minute. Resetting a
  password does the same, and a deleted or disabled account is signed out
  everywhere.
- Privacy: the app no longer loads Inter, Instrument Serif and JetBrains Mono
  from Google Fonts, so a visitor's IP address is no longer sent to Google on
  page load. The same font files are now served from the app itself
  (`public/fonts/ds/`, SIL OFL 1.1), and `npm run tokens:sync` strips the
  Google import so a re-sync cannot bring it back. Every subset Google
  served is kept — Cyrillic, Greek and Vietnamese included — and a page
  downloads only the subsets its text uses. The files have hashed names and
  are cached by browsers for a year.
- Fixed: typing a new Google or Outlook client secret or Resend API key in
  admin system settings saved only its first character. Secret fields now
  save once, when you leave the field or press Enter, and the field keeps
  what you typed while it has focus. The server drops its cached Resend
  client when the key changes.
- Import from Todoist (behind the new `imports` feature flag, off unless a
  flag row turns it on). Settings -> Data -> Import sends you through
  Todoist's read-only consent screen, then a background job brings in
  projects (nesting flattened, the path kept in the description), sections
  as project stages, open tasks with due date, deadline, estimate, priority,
  labels, comments and common repeats, and first-level sub-tasks as task
  parts. Running it again updates what it brought in and never duplicates.
  Completed and archived items, attachments and reminders are skipped and
  counted; progress and warnings show while it runs. The same is reachable
  from outside: `POST /api/imports`, `GET /api/imports/:id`,
  `POST /api/imports/:id/cancel`, and the same under `/api/connect/imports`
  with a connector token (which also accepts a Todoist personal API token).
  Floating due times are read in Todoist's zone or yours; a run whose worker
  died is failed by a 10-minute sweep and its token erased; rows are matched
  per workspace. Needs `TODOIST_CLIENT_ID` / `TODOIST_CLIENT_SECRET`;
  additive migration `20261012090000_imports`.
- Moodboards: a board's references can be read and written through the API.
  `GET`/`POST /api/moodboards/:id/items` and `PATCH`/`DELETE
/api/moodboards/:id/items/:itemId` list the wall in order and add, change,
  move or remove an image, link, colour or note. The board's creator, owners
  and editors write; viewers read; anyone else gets the same answer as for a
  board that does not exist. A board holds at most 500 references on every
  plan; adding one more answers 409. Documented in `docs/connector-api.md`.
- Documents: a backdrop (document themes, and every "All Styles" preset but
  Default) is now Pro on the server too. `PATCH /api/pages/:id` and
  `POST /api/pages` answer a Free plan that sets one with 403
  `UPGRADE_REQUIRED`; a backdrop already on a page after a downgrade stays and
  other edits still save, and going back to no backdrop is always allowed.
  The v3 Style panel opens the plan page when the server refuses.
- Billing: `GET /api/billing` reports `checkoutEnabled`, read from the new
  server-controlled `billing_checkout` feature flag (off unless a flag row
  turns it on). The v3 paywall keeps its checkout button off and says
  checkout opens soon until it is on; its Free and Pro lists now print the
  limits the server enforces (`PLAN_LIMITS`).
- Design v3 port, foundations (behind the `design_v3` flag, off for
  everyone): the new design's tokens, themes and stylesheets are vendored
  under a `.needt-v3` scope (`npm run tokens:sync:v3`, guarded by
  `npm run tokens:check`), with the licensed Exposure face and Newsreader /
  Nunito. A person with the flag sees the app inside the new frame, themed
  System / Light / Dark / Time with nine accents; nobody else sees a change.
- The API takes the fields the new design writes: Trash and the "from
  mail / doc / chat" origin on tasks, "don't split", a project's tint and
  manual order, a habit's own colour, glyph, time, weekly quota and
  project, a document's style and project, Trash and "needs a reply" on
  mail (Needt's copy only — mail stays read-only at the provider), and a
  moodboard's project, link share, Pinterest board and Trash. Each is
  validated, so a bad value is a 400 rather than a stored surprise. The
  database gained them additively, plus tables for task attachments,
  per-person page views, invites by email, per-tool AI access on a page,
  moodboard tiles, notifications and MCP/API access links.

- Brief and Canvas: a connected tool's writing is no longer shown as your
  own. Authorship is carried by the ink and a mark in the margin, and the
  list of authors was closed to four — anything else fell back to "you",
  silently, mark and all. The list is open now, and an author we do not
  recognise writes in the neutral agent ink under whatever name it gave
  when it connected.

- Notifications now appear in the corner the rest of the product speaks
  from, as the design's own cards, instead of as toasts in the opposite
  one. Everything in the app raises a message through one facade, so
  nothing else changed to move them. A repeated status replaces the last
  one of its name rather than stacking beside it, a failure interrupts a
  screen reader instead of waiting politely, and a message that carries a
  button still carries it.
- Security: mail, task-sync and system-settings API responses no longer
  include stored provider credentials. Admin system settings show a mask in
  place of saved secrets, and saving the form without retyping one keeps it.
- Registration is closed until launch. People who already have an account
  keep signing in with a password, Google or Microsoft; a new account is
  refused — the sign-up endpoint answers 403 `SIGNUPS_CLOSED`, and an OAuth
  sign-in that would create a user lands back on sign-in with a line pointing
  to the waitlist at needt.app. It opens when the `signups_open` feature flag
  is enabled at 100%.
- The waitlist has a backend: `POST /api/waitlist` takes `{ email, ref? }`
  from the landing page at needt.app (CORS for needt.app and www.needt.app),
  puts the address straight onto the list in our own database, rate-limits
  per address and per IP, and answers the same `{ ok: true }` whether the
  address was new or already there.

- Sign in wears the design. It was the last screen still drawn in the
  pre-port chrome, and the first one anybody sees. The behaviour underneath
  is the same one that shipped before — the same providers, the same
  register endpoint, the same public-sign-up switch — and recovering a
  password and resending a confirmation are still there, under the password
  field. The separate "confirm password" box is gone, since the show/hide
  eye covers the typo it guarded against, and the optional name at sign-up
  moves to Settings. On a phone the running-day panel steps aside and the
  column takes the screen.
- Shell: the frame no longer claims a second `main` landmark when it wraps a
  page that has one. Two on a document leave a screen reader asking which is
  the main one.

- Shell: Log out logs you out. In the account menu it opened Settings —
  the design preview had no session to end, and the application never
  replaced that stand-in.
- Shell: the rail's search bar opens the command palette again. It was
  wired to the shell's own palette, which the application never mounts
  because it already ships one, so pressing it did nothing at all.
- Focus: starting a session from the shell's rail now starts the product's
  own session. The ported control kept its timer in the page, so a session
  begun there was invisible to the Focus screen, to the history and to the
  stats, and a reload threw it away. Ending one early asks first and waits a
  few seconds, the same as the Focus screen does, and the control says so
  rather than appearing to ignore the press.
- Phone: the bottom bar is the design's own — Home, Calendar, Workspace and
  Docs, with a dot on Home while something is still open today. The shell
  hides its rail below large screens, so the phone had been left with the
  pre-port dock and its five destinations; that dock is the tablet's alone
  now. Focus and anything else without a tab stay reachable from the command
  palette.
- Shell: the application now wears the new design's shell — the wordmark, the
  search, the month, the task rail, focus and the account, with Home,
  Workspace, Calendar and Documents across the top. It was built in September
  and only ever shown on the design preview, so until now every ported screen
  was being drawn inside the old chrome. Sign-in and first-run setup stay
  bare.
- Diagnostics: error reports now carry their stack frames. An exception used to
  reach Sentry as a bare type with no file, function or line, which is not
  enough to act on. The frames name our own source only — locals and source
  context are still dropped, and so are the exception message and the event
  message, because either can quote the data that caused the error.
- Diagnostics: `POST /api/admin/sentry-check` sends one deliberate exception and
  returns its event id, so delivery can be confirmed instead of assumed.
- AI: the hosted agent now runs on GLM 5.3 Flash through OpenRouter instead of
  DeepSeek, and every hosted request asks the gateway to skip providers that
  may retain or train on the data. `NEEDT_AI_GATEWAY_PROVIDERS` pins inference
  to named hosts when you want to be specific about where it runs.
- AI: a free account gets a small monthly allowance instead of nothing, so the
  agent can be seen working before anyone pays for it. The Lifetime allowance
  now matches Pro.
- AI: a provider key the user brings themselves is honoured on every plan,
  including Free. It costs us nothing, and the pay-wall belongs on our key.
- AI: usage counts no longer leave the server. They were hidden from the
  product surfaces but still sent in full to the client, so the exact number
  was one network-tab away; the API now returns only the mode.

- Phone: task cards show their project again on Today, Tasks and Projects. The
  card builder falls back to the design kit's sample projects when it is not
  given the real ones, and three phone surfaces were not passing them, so no
  card matched a project and every one lost its colour and label. The argument
  is now required, so a surface cannot forget it again.

- Calendar: a first run shows the empty-state card again — "Create task" opens
  the task editor and schedules what it saves, and "Connect calendar" links to
  the calendar settings — so a new account is not handed a blank week.
- Calendar: on a phone the header arrows step one day at a time, matching the
  single-day canvas, instead of jumping a week because the week/month chips
  that set the step are desktop-only.
- Settings: the calendar OAuth return banner is back. Connecting or failing to
  connect Google or Outlook once again says so on the Calendars section, with
  a reconnect action on failure, instead of returning to a silent screen.

- Workspace: saved views are back on Tasks and Projects — apply, save and remove
  a view from the workspace header — and the project health journal is readable
  again from the project manager, with posting kept behind edit access.
- Mail: `/mail` renders the mail surface again instead of redirecting to a task
  view that the ported workspace screen does not implement.
- Settings: replaced the legacy settings shell with the ported nine-section
  Needt screen while keeping every production control and legacy deep link.
  Billing now shows the launch prices and trial state, numeric AI usage is no
  longer exposed, and account export/deletion entry points remain attached to
  the real panels supplied by their launch-blocker PRs.
- Design port: removed the public `/design-preview` route now that every ported
  product screen is mounted in place.
- Documents: replaced the legacy Pages list with the ported Needt document
  grid and list over the authorized workspace data source. Search, folders,
  tags, saved filters, favorites, Page/database creation and recoverable trash
  now use the existing server APIs; Viewer mutation controls are absent, and
  the retained editor closes comment, proposal and template-copy write paths
  when Page access is read-only.
- Workspace: replaced the separate legacy Tasks and Projects screens with the
  ported Needt List, Kanban and Flow views over one authorized workspace data
  source. Desktop and phone now share real tasks, projects and members; task
  completion and full task editing persist, project creation/edit/archive/
  restore stays reachable, Viewer access is enforced read-only, and the
  replaced task/project component trees are removed.
- Calendar: replaced the legacy FullCalendar screen with the ported Needt Day,
  Week, Month, Columns and Sequence views. The route now reads tasks, split
  schedule blocks, local calendar events and privacy-safe shared Busy intervals
  through the authorized workspace boundary; Viewer access is read-only, real
  projects own task colour, and FullCalendar and its CSS are removed.
- Today: replaced the legacy agenda/timeline tree with the ported Needt Home on
  desktop and phone. The screen now reads the active authorized workspace,
  persists task and habit completion, plans or moves work through existing task
  APIs, respects Viewer access, and never falls back to fixture briefs or habits
  in production.
- Design data layer: task ids now stay as database cuid strings from Prisma
  through every new-design surface instead of being irreversibly hashed to
  numbers. The Prisma source now requires server-authorized workspace access,
  scopes workspace-owned reads to it, and limits the people registry to that
  workspace's members.
- Wordmark: added `ExposureWordmark`, the variable-font mark driven by the
  now-licensed Exposure typeface's `EXPO` axis — develop-in on mount, an idle
  breathe (with an optional pulse burst), a pointer-driven torch, and a busy
  state for the scheduler. Not yet wired into the shell, which still renders
  the SVG `Wordmark`; see `src/components/needt/wordmark/`.
- Themes: five to choose from instead of three — Paper, Warm, Dim and Dark, plus
  System. System is now a pair rather than a mode: you choose which theme fills
  the light half of the OS preference and which fills the dark half. A saved
  Light becomes Paper and a saved Graphite becomes Dim, so nothing has to be
  picked again.
- Themes: the pre-paint script that stops the flash of the wrong theme is now
  generated from the same function the app itself uses, instead of being a copy
  of it kept in step by hand. The two had already drifted — the script never
  learned to set the `data-theme` attribute the running app had been setting.

- Task editor: the dialog is 840x620 instead of 960x767, and its header row is
  shorter. The old size was set by the screen rather than by the content — the
  field column ran out well before the bottom edge and the description area held
  a half-window of blank space.
- Task editor: switching between Task and Event keeps the title and description
  you have already typed, in both directions. Previously the switch closed one
  editor and opened the other, and everything typed was lost.
- Task editor: the selected half of the Task/Event switch is now clearly the
  selected one — it sat on `--surface-selected`, nearly the same tone as its own
  track in the light theme. Both halves say what they mean on hover: a task can
  be moved by the planner, an event stays where you put it.
- Task editor: the first label is shown as the task's Category, with its colour,
  because that is what the calendar paints the block with and what the month view
  groups by. It used to render as a plain comma-separated list.
- Calendar: tags are now loaded on the calendar page. They were fetched only on
  /tasks, /today and /projects, and the calendar's task editor read them through
  a non-reactive `getState()` snapshot — so opening a task from the calendar
  showed an empty label list and no category at all, no matter what was set.
- Task editor: plain-language hints on the fields nobody can guess —
  Auto-scheduled, Min chunk, Hard deadline and Schedule.
- Auth: a server error during sign-in no longer counts against the account. The
  credentials route treated any `status >= 400` as a wrong password, so a 5xx
  from the rate limiter — Redis unreachable, or `RATE_LIMIT_HASH_SECRET` unset —
  accumulated brute-force strikes and locked people out after five attempts they
  never made. Server errors now leave the counter untouched: they neither add a
  strike nor clear existing ones, so an attacker cannot reset their own count by
  provoking errors.
- Scheduling: hard-deadline overflow no longer reaches into the night. Meeting a
  hard deadline may still use time outside the work schedule — that is
  deliberate — but the search is now bounded by 07:00 and the configured hard
  stop, instead of walking the clock and returning 03:00.
- Scheduling: energy windows no longer decide where a task lands. They narrowed
  the day to a few hours, so tasks piled into those hours or found no slot at
  all — and anything carrying a hard deadline then fell through to the overflow
  path, which ignores work hours entirely and could place a block at three in
  the morning. Auto-scheduling now runs against work hours only.
  `EnergyProfileWindow` rows are left untouched so an assistant can still read
  them as a stated preference.
- Settings: removed the "Energy & focus" panel, whose profile no longer affects
  scheduling, and the "Deadline colors" thresholds. "Break between tasks" is
  unaffected.
- Calendar: a task's colour again means its category. The store derives the
  colour from the task's first tag, but `CalendarEventContent` overwrote it with
  a priority colour, so every medium-priority task looked identical and
  categories were invisible. Priority now shows as rail weight instead, and
  overdue — a state rather than a belonging — is the only thing that overrides
  the rail.
- Calendar: inside a day, month-view items group by category rather than
  interleaving by clock time, so the colours read as bands. Timed items show
  their time inline with the title in month cells instead of on a second line,
  which halves the height each task costs in a crowded cell.
- Calendar: a dragged item keeps its own colour and category rail. A rule was
  flooding the drag mirror with `--surface-selected` through `!important`, so
  the card in hand read as a grey placeholder. It now lifts, tilts slightly and
  shows a `grab` cursor only on items that can actually be moved.
- Design: `--surface-panel` and `--surface-raised` are no longer aliased to
  `--surface-canvas`, restoring three distinct elevation levels in both themes;
  menus, popovers and dialogs sit on the raised level.
- Build: `tsconfig.json` and the ESLint config no longer pull the self-contained
  `landing`, `landing from figma` and `New ui ` sub-projects, or the design
  reference kit, into the root gates. Each carries its own tsconfig and
  dependency set, so the root run resolved their imports against a
  `node_modules` they do not share — 907 reported problems, none actionable.
- Dev: added `prisma/dev-seed.ts`, which fills a month with deliberately uneven
  load — empty days, ordinary days and one day carrying eleven tasks — because a
  month view only breaks on edge cases.
- Docs: added `docs/plans/12-remaining-work.md` as the governing plan, written
  against verified production state on 2026-08-24, and demoted
  `docs/plans/09-launch.md` to reference — its L0 sequencing described merged
  work as blocking. Records four live P0 defects: the admin credentials screen
  has no route rendering it, the Creem checkout is enabled in production with no
  lifecycle test, push reminders fail silently without `VAPID_PRIVATE_KEY`, and
  account deletion and data export do not exist.
- Ops: `needt-collaboration` restored — Coolify published port 3000 while
  Hocuspocus listens on 1234, leaving the service down from 2026-08-13 to
  2026-08-24.
- Ops: `www.needt.app` now 301-redirects to the apex domain with the query
  string preserved, via a Cloudflare redirect rule on a proxied CNAME.
- Updated Pro monthly to $7 and Lifetime to $149, hid hosted-AI usage counts
  from product surfaces, and added private input/output token accounting for
  hosted provider calls alongside the action count.
- Lifetime checkout now closes after 300 buyers with concurrency-safe holds,
  idempotent retries, and provider-confirmed expiry. The cap is enforced when a
  checkout is created; a payment Creem has already taken always grants the
  plan, and a completion whose reservation is missing or expired is recorded as
  `processed_without_lifetime_reservation` instead of being refused.
- Added non-blocking email confirmation with one 14-day Pro trial per canonical
  email, OAuth trial activation, day-11/day-14 worker emails, safe Free expiry,
  and verified-owner gates for booking publication and outbound guest email.
- Added a complete account archive and a re-authenticated, seven-day account
  deletion flow that removes personal data while preserving scrubbed,
  authorless shared-workspace tombstones.
- Kept hosted AI available in a bounded slower mode after its normal allowance,
  while preserving uncapped BYOK access and hiding usage counts from chat.
- Added an admin-only System settings route and account-menu links for system
  credentials and operations, with a contract check preventing orphaned
  admin-only settings components.
- L0 release line is tagged `v0.4.0`; production image verification is provided
  by the required `docker-publish` CI workflow on the same SHA rather than a
  local Docker Desktop build.
- Kept the local Figma capture workflow opt-in for development while preventing
  its third-party script from entering production builds, and ignored local
  browser-agent artifacts and root mobile screenshots.
- Fixed the production `/style` laboratory so its admin authorization runs per
  request instead of being frozen as a build-time 404.
- Docs: added `docs/plans/09-launch.md` as the governing plan through public
  launch — release unblock (focused-Mail visual, non-production artifacts,
  S11/T8 integration), production-readiness audit, billing lifecycle, first-run
  experience, legal/account lifecycle, staging rehearsal, launch operations and
  post-launch product work. Recorded the owner's expanded agent autonomy
  (merge, push/PR, additive schema, reviewed baselines) in `AGENTS.md`.
- Docs: added `docs/plans/10-design.md`, the design identity track — identity
  spike as three live variants in `/style`, a semantic motion language replacing
  raw durations, the schedule-reflow signature interaction paired with the
  capacity/what-if feature, foundation retuning, navigation rebuild, flagged
  screen rollout after launch, and a craft pass. Figma is out of the pipeline;
  design happens in code. Recorded the explicit do-not list for decorative
  effects in `AGENTS.md`.
- Docs: archived 34 superseded root-level planning/scratch files (Jul-dated,
  predating the current `AGENTS.md`/`docs/plans/*` structure) into
  `docs/_old/`; added `BOOTSTRAP.md` as a copy-paste first-message prompt for
  any new agent chat, enforcing the required reading order and an
  end-of-session handoff save before context/usage limits are hit.
- Added workspace-safe capacity and reversible schedule previews, versioned
  Saved Views, project-health history, flexible habits with weekly Focus
  targets, and approval-only meeting-note task/schedule proposals.
- Style: applying a theme token object in `/style` now persists it per user and
  updates shared product controls globally.

### Changed

- Critical operations alerts now reach the owner by email at
  `NEEDT_ALERT_EMAIL` instead of stopping at Sentry, which nothing was
  watching. Warnings stay in Sentry, and the web container and the worker
  share one deduplication window so a fault is reported once.
- Refunds and chargebacks now take the plan back. `refund.created` and
  `dispute.created` were enabled in Creem and handled nowhere, so a customer
  who charged back kept Pro or Lifetime silently and with no record. A refund
  smaller than what was paid leaves access alone; a Lifetime refund returns the
  seat to the 300 automatically, because the cap counts subscription rows.

- New accounts now start with auto-scheduling defaults, actionable empty states
  across primary routes, and recoverable calendar connection errors; calendar
  OAuth callbacks are bound to the user who started the connection.
- Page block writes now defer to an active collaboration session and persist
  its CRDT state and relational block projection atomically, preventing stale
  REST autosaves from overwriting live edits. A versioned collaboration room
  also prevents pre-fix offline documents from resurrecting removed blocks.
- Notification settings now preserve saved browser-push and reminder-timing
  preferences while reporting unavailable delivery, and reminder workers warn
  once per process with the missing VAPID variable names.
- Google sign-in now requests only basic identity scopes; Calendar access is
  requested separately when connecting a calendar, while Google Tasks sync is
  explicitly deferred with an actionable connection error.
- Release automation now permits a repair deployment when the currently live web health endpoint is unavailable, and publishes the native AMD64 image only. Local Compose starts the matching web, private worker, collaboration, PostgreSQL, and Redis topology.
- Tasks now show a private seven-day capacity summary and an explainable,
  reversible schedule preview with unscheduled-task and stale-preview recovery.
- Task List can save and apply personal or role-gated workspace views without
  changing the active workspace scope.
- Projects now expose a versioned health journal and role-gated status-update
  composer with concurrent-update recovery.
- Focus now shows each member&apos;s workspace-scoped weekly target, progress and
  editable minutes without exposing another member&apos;s focus data.
- Focus now includes flexible personal habits that can be created, placed into
  the current week and archived through the workspace-scoped scheduler.
- Account settings now include a data-derived setup checklist that guides users
  through account, calendar, workspace and first-task actions.
- Mail messages can now snooze locally until tomorrow morning or create a
  workspace reminder task for that time without changing provider state.
- Settings now filter their existing desktop and mobile navigation by name.
- Moodboards now have a searchable recent-and-all list and a clear first-board
  state, while preserving the existing canvas workflow.
- Restricted the internal `/style` laboratory to administrators in production,
  while keeping it available for local design work and visual regression checks.
- Made the live `/style` laboratory wider and easier to scan, clarified the
  saved-versus-preview state of its theme editor, and kept named theme choices
  visible on phones.
- Reworked Pages around the existing MIT-licensed Tiptap editor: the desktop editor now has a quiet persistent formatting/insert toolbar and a simplified document header, phones have a Notes-style bottom action bar and formatting/insert sheets, and the Pages home now provides search, favorites, recent notes, and honest quick-create actions.
- Updated Auth.js Core, Excalidraw, Next.js 15, and compatible transitive dependencies; the production audit no longer reports critical vulnerabilities, while breaking major upgrades remain isolated for a dedicated migration.
- Pages now use a viewport-safe slash-command sheet on phones, expose block reordering after a scroll-safe 350 ms long press, and position the selection formatting toolbar outside the selected text.

- Project dependencies are now created only between tasks in the same active project, remain readable as soft-removed history, and block cross-project task moves with the linked task named in the conflict message.
- Project removal now archives projects without deleting tasks, stages, blockers, or history; archived projects are read-only and can be restored from the Projects screen.
- Auto-scheduling now plans only tasks assigned to the active user, using that assignee's schedules, flexible hours, calendar conflicts, reminders, and calendar-block destination; shared-workspace members receive redacted Busy intervals for one another's personal events without titles, descriptions, attendees, organizers, or locations.
- Authenticated API requests now resolve workspace membership and minimum roles through one server-side authorization boundary, while the disabled rollout flag preserves legacy `userId` scoping.
- Replaced global lift, zoom, and icon-growth effects with calm contrast feedback, short fade/slide overlays, restrained drag springs, and one reduced-motion runtime that honors OS, saved, and hidden-tab preferences across every route.
- Completed the internal `/style` laboratory for Light, Graphite, and Dark, and aligned product pickers, surfaces, overlays, rows, cards, and feedback states with the shared semantic design-system contract.
- Flattened Focus into one state-stable canvas, made the AI companion freely draggable and keyboard movable with a saved safe position, unified product notifications behind the typed facade, and constrained Settings content to the shared readable width.
- Unified desktop Calendar range navigation around current-time positioning, horizontal gestures, Shift+wheel, Alt+Arrow, and Space+drag; Today now keeps its document and day timeline in independent desktop scrollers.
- Moved Mail into Workspace as an "Email" tab (`/tasks?view=mail`) instead of a separate sidebar item; the old `/mail` URL redirects there.
- The sidebar's account menu trigger now shows the signed-in user's name next to their avatar, not just the avatar.
- Notifications now use one accessible, animated top-center queue with deduplication and a visible dismiss control.
- Space now inherits the active canvas with a transparent, pointer-inert particle layer that stops for reduced motion and hidden tabs.
- Space task nodes now use the same neutral calendar-card language, accent rail, hover wash, and inset selection outline.

### Fixed

- Made the admin System settings page SSR-safe and restored its middleware and
  database-backed authorization checks, including protection against stale
  deactivated-admin sessions.
- Made Creem webhook handling replay-safe and order-aware, preserved paid
  access only through documented retry/grace periods, and surfaced actionable
  failed-payment status in Billing settings.
- Restored Prisma migration/schema compatibility without rewriting user data:
  retained five legacy AI indexes and promoted the existing Page–tag join
  unique pair to Prisma's composite primary-key representation.
- Restricted privileged publish/deploy workflow runs to successful default-
  branch pushes from this repository, made source-consuming jobs verify the
  exact immutable CI release SHA, and made deploys use that SHA.
- On phones, Space now offers working Task List and Board fallbacks instead of
  directing people to a desktop-only canvas.
- Pages can now be organized with workspace-scoped folders and tags, and users
  can save a versioned Smart Folder filter without exposing another workspace.
- Workspace switching now clears prior Query and Zustand data, scopes browser
  API calls, realtime and offline replay to the selected membership, and lets
  members create, leave or decline shared-workspace invitations safely.
- CalDAV single-occurrence edits and deletions now modify the recurring master
  resource with `RECURRENCE-ID`/`EXDATE`, retain explicit overrides correctly,
  and no longer resurrect excluded occurrences during local sync.
- Retrying a failed `/task` command in Today now creates the restored task
  instead of reopening it as editor text; collaboration security tests also
  generate ephemeral signing keys, and visual baselines are platform-specific.
- Kept authentication secrets runtime-only during production image builds,
  rendered session-dependent pages on demand, and made container startup stop
  immediately when required environment validation or migrations fail; rolling
  dependency writes remain compatible during workspace migration, and release
  automation waits for the exact healthy web SHA before dependent runtimes.
- Kept unassigned Space task nodes in a stable date order instead of letting
  database response order move them between visits.
- Made offline task, Page, and Today replays idempotent and revision-aware so
  reconnecting cannot overwrite a newer server version; connector-triggered
  scheduling now stays inside the authorized workspace, and production web
  startup fails closed when its authentication secret is missing.
- Simplified the AI companion into a compact, high-contrast draggable action
  and keep it clear of fixed mobile and editor controls across viewports.
- Revalidated collaboration authorization for every live socket message and
  idle connection, so workspace removal closes the room and Editor-to-Viewer
  downgrades become read-only without waiting for reconnect; Page and Moodboard
  clients and server route bundles now share one pinned Yjs runtime, while
  BullMQ stays outside Next bundles.
- Partitioned offline pages, API snapshots and mutation queues by schema, user
  and workspace; logout/account changes now purge private browser state, only
  explicitly safe writes can queue, and failed replays remain visible for
  conflict or sign-in recovery instead of being silently discarded.
- Replaced user-triggered physical deletion with recoverable archive semantics
  for tasks, projects, calendar events and feeds; AI and connector mutations now
  confirm the exact target, provider sync preserves tombstones, and disconnecting
  an account revokes credentials without cascading through local calendar data.
- Hardened authentication and workspace isolation: stale or disabled-user
  tokens now return `401` before personal-workspace creation, admin routes use
  the current database role, logs metadata requires admin access, and AI,
  search, exports, connectors, schedule previews and task-sync mappings retain
  the active workspace scope server-side.
- Made Today autosave serialize date-keyed writes without stale success or failure clearing newer drafts, collapse duplicate inline task references, preserve completed tasks on historical days, and reject interrupted/invalid agenda request bodies cleanly.
- Prevented stale Excalidraw clients from overwriting concurrent edits to different existing moodboard elements by publishing per-element scene deltas.
- Fixed mobile Page block dragging when pointer capture is unavailable and made drop targets resolve to the nearest block instead of skipping over short blocks.
- Made Playwright honor `TEST_BASE_URL` for both navigation and dev-server readiness, so local UI gates can run reliably on a non-default port.
- Hardened shared-workspace API boundaries: expired paid plans can no longer read shared workspace metadata or data, invite creation and acceptance are rate-limited, project mutations retain workspace scope at write time, concurrent personal-workspace initialization is race-safe, and shared calendar Busy intervals no longer expose source event IDs.
- Completing a recurring task now records the finished occurrence as an immutable instance linked to its series master, instead of rewriting the master row and leaving a detached completed copy. The master only advances to the next occurrence, so editing a series affects future occurrences and never rewrites past ones. Completion is idempotent — a repeated or concurrent completion of the same occurrence can no longer create duplicate instances.
- Auto-scheduling now honors task start and postpone dates, preserves exact unscheduled reason codes, falls back after soft deadlines, and refuses to place hard-deadline tasks past their deadline.
- Fixed the root `not-found.tsx` rendering its own `<html>`/`<body>` nested inside the app's root layout, crashing the React tree on any genuinely missing route (could leave client-side navigation, including `/style`, stuck broken until a hard reload).
- Reduced the blocked-hours diagonal texture's opacity and tightened its stripe spacing so it reads as the same pattern in the short all-day row as in the full-height timed grid, instead of smearing into a solid block there.
- "Start task now" now bypasses blocked-hours overrides, since it's an explicit immediate action; all other manual scheduling continues to respect them.
- Calendar events keep the neutral task-card background with a colored accent rail and dot (dropped an intermediate full-color-tint treatment that didn't read well).
- Clicking an existing Calendar event in Week/Day/Month/multi-month view now opens the full editor directly, matching tasks, instead of an intermediate quick-view popover.
- Blocked whole-day overrides now also texture and block the Calendar's all-day row, not just the timed grid.
- Removed weekend-only shading from the all-day row, which doesn't represent hours.
- Fixed a client/server hydration mismatch on the mini calendar's today/selected-day highlighting.
- Fixed the blocked-hours placement guard resolving "today" from the server's local timezone instead of the signed-in user's, which could mis-apply near a day boundary.
- Fixed dragging to create a new work-schedule window resetting the editor's scroll position back to its default on every drag update.
- Replaced unguarded `crypto.randomUUID()` calls (which throw outside secure/HTTPS contexts) with a fallback, fixing crashes on Today, Pages, and the schedule editor when accessed over plain HTTP/LAN.
- Added an inline pre-hydration script that applies the saved theme before first paint, removing a brief flash on load.
- Made the Calendar all-day row a visible, clickable target for creating all-day tasks/events (fixed a Day-view border gap, added a hover cue and a quiet "All day" label).
- "Shade non-working hours" now reads from the user's real default Schedule (per-day windows) instead of a stale, disconnected flat setting, so weekday and weekend shading are consistent.
- Replaced the bordered box around today's date chip in Week/Day view with a small accent dot.
- Fixed "Block out hours" rendering as a flat shade instead of its diagonal texture (background events were incorrectly rendering the normal task/event card on top, and a global `.fc-event` reset was stripping the texture's background-image); manually creating, dragging, resizing, or dropping a task/event into blocked hours is now rejected client- and server-side with a toast/400.
- The "Edit schedule" grid now spans the full 24 hours (previously hard-capped to 6am–10pm) and opens scrolled to 6am by default.
- Added recognizable open-source icons across Integrations, including native Google, Outlook, Apple/iCloud and Needt API marks plus Composio provider badges.
- Made the Calendar `+` open Create Task directly on desktop and mobile, with Event selected inside the shared type switch. Task and Event now use one responsive grid shell with continuous dividers, the same rich-text editor, shared date/time pickers and controls, and a matching save footer; current-day headers span weekday/date, reveal flexible-hours actions only on hover/focus, and render override texture in both Week and Day.
- Reconciled Today through the same stable-ID, versioned document contract as Pages, placing live task groups inside the editable document so notes can sit between them. Today now uses denser Agenda proportions, independently scrolling desktop panes, and 15-minute timeline move/resize interactions that pin manual task placements while retaining drafts, save state, mobile sheet, and explicit evening review.
- Replaced destructive single-HTML Page saves with stable-ID block reconciliation and revision snapshots, keeping retained blocks and AI provenance intact across edits.
- Replaced synthetic `Unavailable` calendar events with date-specific flexible-hours overrides for start-later, stop-early, blocked ranges, and whole days. Overrides now intersect with task schedules, render as striped availability texture, and retain hidden legacy `[NEEDT_DAY_BLOCK]` events for compatibility.
- Grouped desktop Settings into the same Planner, Preferences, Connections, and Account sections as mobile, pinned Report a bug below the scrolling navigation, and converted ordinary settings rows to the compact label-to-control rhythm.
- Split the former graphite dark palette into an explicit Gray theme and a true Dark theme based on `#0E0E10`; existing Dark users and System dark now resolve to true Dark, while the retained legacy background-tint value no longer overrides global theme tokens.

- Completed authenticated responsive regression coverage for the Pages, Today, Settings, integrations, and private bug-report states; stabilized their visual fixtures and replaced the bug report severity native select with the shared house-format picker.

- Completed the design-system hardening pass: Calendar tasks use priority rails and soft selected tints without a black ring; Today uses a wide editable document with a narrow synchronized day timeline, mobile calendar sheet, offline drafts, undo, overload/empty/error states, and explicit evening rollover review; Settings navigation is immediate and Appearance autosaves with rollback.

- Reduced Calendar hour and day grid lines to a Motion-measured 6% foreground wash, keeping the layout legible while making the structure substantially quieter in light, dark, and custom-tinted themes.
- Rebuilt Workspace Timeline as a full Motion-measured Gantt over the existing `Task` model: a sticky project/task tree, month and week rulers, today marker, weekend bands, project summaries, searchable filters, grouping and sorting, month/quarter/year scales, jump-to-date controls, and task bars that open the shared editor now coexist without creating a parallel task system or changing the scheduling engine. Settings content is also left-aligned with its page header on desktop instead of floating in the center of wide screens.
- Aligned the shared dark theme controls with measurements from Motion's live rendered UI while retaining Needt's indigo accent. Buttons, tabs, fields, checkboxes, switches, selects, searchable/creatable pickers, and the task modal now share compact token-based geometry. Desktop picker menus use an 8px panel radius, 1px border, 32px rows, 14px labels, 6px row radii, neutral selected rows with no checkmark, and a two-layer depth shadow; the date picker uses the measured 443×317px calendar/shortcut layout. Command-palette CSS is scoped so it cannot distort picker rows. Opened pickers, menus, popovers, dialogs, and sheets consistently render the shared shadow, while colored glows remain absent. Calendar tasks and events now share a compact neutral card with a 4px color rail, 12px type, a solid task or dashed event border, a 15% hover wash, no lift/shadow, and an inset selected outline. All motion continues to respect `prefers-reduced-motion`.
- Finished Today as a race-safe per-day document: canonical task references now remain inline after `/task`, task actions use shared pickers and the existing editor, stale day loads cannot flash or overwrite newer text, failed loads/saves retain an explicit retry path, and the desktop document/timeline plus mobile/tablet layouts use Motion-sized typography and controls in both themes.
- Rolled back the global spring motion pass from PR #14 across routes and shared controls, restoring the previous local component animations while keeping reduced-motion support and the newer Calendar functionality.
- Kept scheduled task blocks at their stated duration by reserving ADHD estimate inflation as a separate gap, retained completed tasks as dimmed checked calendar items, removed the Chrome install banner, and aligned the mini calendar's week start and light-theme styling with user settings.
- Made the task editor's auto-schedule state explicit: a disabled switch now says `(Off)` instead of incorrectly looking like a pending scheduling request.
- Restored the missing `20260711220000_calendar_workspace_upgrade` migration-history marker so existing production databases and the repository agree on migration order before newer Focus, Boards, realtime, Mail, AI, billing, design-token, and Today migrations are applied.
- Fixed production startup accidentally downloading Prisma 7 through `npx`, which rejected the Prisma 6 datasource schema and skipped migrations. Runtime images now ship and invoke the lockfile-pinned CLI, reuse the client generated at build time, and no longer make a fragile middleware request back into the same container for the root redirect.

### Added

- Added collaborative Moodboards: an Excalidraw canvas for images, sketches,
  sticky notes and export; workspace-scoped boards with live presence; periodic
  recoverable snapshots; Full Access/Editor/Viewer enforcement; and a
  safe-area-aware mobile workspace.

- Added the Moodboard security foundation: workspace-scoped boards, direct Full Access/Editor/Viewer grants, five-minute document-scoped collaboration tokens, membership and role rechecks at WebSocket authentication, and server-enforced read-only Yjs connections for Viewers.

- Pages can now be published through separate read-only bearer links with public asset delivery; unpublishing revokes the link and closes already open public sessions immediately.

- Added self-hosted realtime Page collaboration with short-lived document-scoped tokens, server-side workspace and Page authorization, Yjs presence/cursors and offline merge semantics, Postgres persistence, and optional Redis fan-out.

- Pages now resolve Full Access, Editor, and Viewer roles per document, with direct member grants overriding inherited workspace access on every Page-backed API.

- Pages now provide a nested workspace tree, real tables, resilient autosave drafts with offline retry, revision restore, backlinks, workspace-scoped inline tasks and projects, and reviewable Needt AI rewrite, summary, and critique proposals.

- Added workspace-scoped Projects with stages, task and external blockers, derived task progress, dedicated List/Kanban/Gantt views, and regular or workflow templates with placeholder-role assignments and relative dates.
- Added workspace-scoped task assignees, Busy/Free status, stage references, and task activity records; existing owned tasks retain their owner as assignee, while intentionally unassigned tasks report `NO_ASSIGNEE` instead of being scheduled.
- Added paid shared-workspace creation and expiring, single-use invitations with Owner/Editor/Viewer enforcement and protection against removing or demoting the final Owner.
- Added the feature-flagged workspace tenancy foundation with personal workspaces, Owner/Editor/Viewer memberships, expiring invite records, and an idempotent backfill for existing projects, tasks, boards, and pages.
- Added non-destructive task archiving with a read-only Archived view, restore actions, and exclusions from normal planning, Focus, reminders, search, AI context, connectors, and project counts; legacy task deletion now archives data instead of removing it.
- Added a Notion-like Page canvas with a borderless title, icon and cover controls, full-canvas focus, searchable keyboard slash commands, canonical text/list/checklist/quote/code/divider blocks, and extensible callout, toggle, link, bookmark, media, layout and mention blocks.
- Added private Page assets, resolvable comments, reusable templates, authenticated forms, explicit AI proposal diffs, and functional Table, Board, List, Calendar, Timeline, and Gallery database views over shared editable records.
- Added named work schedules with saved timezones, multiple daily intervals, default selection, task and recurring-task assignment, selected-day copy, precise time fields, and 15-minute create/move/resize editing. Existing work hours migrate additively into the first `Work Hours` schedule and the deterministic scheduler resolves each task against its selected schedule.
- Added personal Pages as the product replacement for task Boards while preserving legacy board data. Pages include hierarchical/private documents, revision-backed blocks, six database views over shared records, typed properties, safe formulas, AI provenance, strict private-tree exclusion, and preview/approve/reject AI change proposals.
- Added a searchable responsive integration catalog with native calendar connections and an isolated, optional Composio adapter; added database-backed bug reports with safe diagnostics, private attachments, admin review, and BullMQ-backed GitHub Issue retry.
- Moved production images from Docker Hub to `ghcr.io/teenxgrails/needt` with gated multi-architecture SHA builds and optional ordered Coolify migration/worker/web deployment hooks.

- Re-enabled public account registration directly on the Sign In card with server-side email/password validation, BCrypt password hashing, duplicate-account handling, default user settings, password confirmation, and automatic sign-in after account creation. Public signup now defaults to enabled for fresh and existing installations while remaining administratively disableable through System Settings.
- Expanded `/style` into a live Needt Design Lab with stable component references, real interactive states and overlays, responsive previews, and an isolated semantic-token theme editor that can save a local draft or export CSS without changing product settings.
- Added one persistent secondary Calendar timezone with add, edit, and remove controls, plus Motion-style per-day controls for starting later, stopping early, blocking hours or a whole day, and resetting the day's availability.
- Added a local, privacy-preserving Needt AI companion: a round, diffused cyan/blue/violet aurora character whose symmetric geometric face and color field smoothly bend toward the pointer, shift from teal to violet/rose with distance, blink naturally, react to planner actions, occasionally offer route-aware suggestions, open the existing AI chat, adapt around the mobile dock, and respect reduced motion.

- Rebuilt Today around a persistent per-day Agenda document: rich-text notes, `/task` creation and core slash commands share the center canvas with editable task rows, while the desktop right rail is now a full one-day Motion-style timeline. Task titles open the full editor, inline dates and durations save immediately, completed work remains visible in historical days, and the mobile route keeps its existing shell with the same Agenda task language.

- Added a token-based Animated Beam connection map to Settings → Integrations, showing Google Calendar, Outlook, iCloud, and the Needt API flowing into one planner with active calendar links reflected in green and reduced-motion support.
- Expanded Boards into a full-page Notion-style workspace with persistent Table, Board, List, Timeline, Calendar, and Gallery views over the same Needt tasks. Timeline and Calendar also surface existing calendar events as read-only context; Boards now have a dedicated index, inline title/icon editing, a full-screen view-first creation flow, and responsive dark/light visual coverage.
- Added deterministic Playwright visual-regression coverage for Calendar, Today, and Space at 1440px desktop, 768px tablet, and 375px mobile viewports, including isolated test data, fixed time/timezone, and portable baseline names.
- Replaced the inherited placeholder/Stripe billing path with Creem merchant-of-record checkout for Needt Pro ($6 monthly or $60 yearly) and Lifetime ($79), a signed idempotent webhook mapper, customer portal access, subscription lifecycle fields, and a complete house-format Billing settings page. Added server-side Free/Pro/Lifetime entitlements for calendars, auto-scheduling, Boards, Mail, AI, and Focus analytics, with neutral behavior when Creem is not configured.
- Expanded the existing AI chat into a user-scoped planner copilot with one Zod-validated tool catalog for Tasks, Boards, Focus, read-only Mail, Settings, and durable non-sensitive memory. Added ranked, token-budgeted prompt assembly with today's schedule, hosted DeepSeek-compatible fallback and monthly action metering, daily briefing and overload entry points, Settings memory controls, and deterministic reschedule previews with explicit Apply/Cancel plus one-step Undo.
- Added a local-first, read-only unified Mail inbox for Gmail, Outlook, and IMAP with encrypted IMAP credentials, provider cursor sync in the existing BullMQ worker, lazy sanitized message bodies, remote-image blocking, unread/archive actions, and task creation from email.
- Rebuilt Focus into a persistent, server-backed timer: the running session is now owned by the server (`FocusSession` with an active `endedAt = null` row, accumulated pause time, and source), so the timer survives navigation and full page reloads instead of resetting. Start/pause/resume/stop go through `/api/focus/session`, the sidebar Focus item shows the live ticking time, sessions can be bound to a task or run explicitly as a "Free session", completing a session prompts to mark the task done / log and continue / start a break, browser notifications (with an in-app toast fallback) fire on completion, and a house-format week bar chart joins the Focus / Streak / Hours stats. Added `GET /api/focus/active` returning `{ active, taskId, endsAt }` for a future website-blocking Chrome extension, an `actualFocusedMinutes` field written onto tasks, a "Start focus" task action, and an explanation on the Focus Quick Actions when no task is bound.
- Added Boards v1 — a Notion-like board system on top of the existing task model. New Prisma models (Board, BoardColumn, SavedView) plus additive Task fields (boardId, boardColumnId, boardPosition, properties) that leave the scheduling engine untouched: a board task is the same task the auto-scheduler works with. A "Boards" sidebar section lists boards with a "+" to create one (Start empty or a Tasks Tracker / Semester plan template). The board view has custom columns with per-column WIP counts, an inline "+ New" card add, an "Add column" affordance, and keyboard-accessible drag-and-drop of cards within and across columns (fractional-index ordering, unit-tested). Clicking a card opens the shared task editor as a side panel. REST API under `/api/boards/**` and a `canCreateBoard(userId)` free-plan seam. (Group-by / Sort / Filters toolbar, per-SavedView persistence, emoji icon picker, CSV import, and the AI "describe your board" scaffolder are marked //todo for a follow-up.)
- Made the app usable on mobile with the same routes and no parallel component tree: a persistent Calendar, Today, Tasks, Focus, and Me tab bar; a dedicated top-bar AI entry; a Tiimo-structured Today agenda; swipeable Calendar day navigation; horizontally snapping Boards; stacked Mail list/reader panes; responsive Focus; and full-screen AI Chat. Shared bottom sheets, safe-area spacing, 44px touch targets, the "Space is best on desktop" treatment, and the second-visit PWA install prompt keep the phone experience app-like without changing its APIs.
- Added persistent Motion-style task defaults for project, status, priority, scheduling, duration, chunks, dates, deadlines, and schedule; new task forms now consume those defaults.
- Added a user-ready Billing page backed by the existing subscription model, with plan state and included-usage details.
- Added BullMQ-backed calendar sync, rescheduling, and webhook-renewal queues with a separately deployable worker bundle.
- Added verified Google Calendar push channels and Microsoft Graph subscriptions, incremental provider sync, and automatic subscription renewal.
- Added authenticated Redis-backed SSE updates so calendar and task changes refresh connected clients within seconds.
- Added a Motion-style Settings information architecture with dedicated Calendars, Auto-scheduling, Task defaults, Theme, Timezone, Notifications, Schedules, Desktop app, Integrations, API, Privacy, AI Assistant, and Account pages.
- Added a full-screen weekly schedule editor with per-day drag selection, copy-to-week, timezone context, and persistent scheduling-engine work hours.
- Added a minimal `/quick-add` route: a single brain-dump input that runs text through the existing `/api/ai/parse-tasks` parser and creates the resulting tasks (Cmd/Ctrl+Enter to submit), house-format and dependency-free.
- Added Space as the primary Solo workspace view: a lightweight animated constellation of the same scheduled tasks used by Calendar, with project clusters, task details, pan/zoom, completed-task visibility, and drag-to-reschedule across the next 14 days.
- Added configurable Solo workspace views and Motion-style menus for grouping, sorting, layout, filters, projects, visible columns, view management, creation, and task actions.
- Added a Motion-matched calendar task actions menu with completion, cancellation, link, scheduling, duplication, project, template, archive, and delete actions.
- Added spring-based task dragging with a Motion-style lift preview, reduced-motion fallbacks, and direct Today-sidebar drops onto the Day and Week calendar grids.
- Added a lightly staggered spring settle animation when auto-scheduling moves task chips into their new calendar slots.
- Added an immersive Focus transition that dims side content without blur, centers a Liquid Glass focus card, and animates the timer with an accessible SVG progress ring.
- Polished the command palette with fuzzy-ranked matches, highlighted match characters, a subtle result stagger, and a reduced-motion-aware spring open/close transition.
- Added native, reduced-motion-aware view transitions between Calendar, Tasks, and Focus while keeping the persistent navigation and overlays stable.
- Added reduced-motion-aware number transitions for task counts, project alerts, focus stats, tracked time, and planning capacity.
- Added reduced-motion-aware list transitions for task tables, project boards, and the Today sidebar so optimistic changes settle smoothly without delaying input.
- Added instant optimistic task creation, editing, completion, movement, and deletion across Tasks, Calendar, Focus, Smart Planning, and project drag-and-drop, with server reconciliation and automatic rollback when a request fails.
- Added Motion-style calendar creation: clicking or dragging an empty Week/Day time slot now opens a lightweight task-first quick creator. Press Enter to create an auto-scheduled task, choose Event for a fixed block, or open the full Task editor for advanced options.
- Rebuilt the Event creator as a full Motion-style, two-column editor with time controls, repeat settings, and a dedicated Event details panel.
- Restored the month mini-calendar in the left sidebar with Motion-sized 24px dates, a white selected day, a TODAY marker, seven-day navigation, and a month/year picker.
- Added a "Today's tasks" panel in the left sidebar listing incomplete tasks that are overdue or due today, sorted most-urgent first with a colored urgency circle (red for overdue/due soon and pinned to the top, yellow for approaching, green for plenty of time). Hovering a row reveals an animated circular start button that opens a "Start task now" modal — choose how long to work (5–120 min), optionally start Focus, and the block is allocated now while the scheduling engine moves other tasks around it. Chosen durations are learned per task title so similar new tasks are prefilled. Urgency thresholds are configurable under Settings → Task urgency

### Changed

- Calendar selection now opens Create Task directly, while Task and Event share a narrower editor language with a creation-only type switch, smooth shared overlay motion, neutral day outlines, and keyboard save shortcuts.
- Continued the Needt design pass outside Today: Settings now has a native grouped mobile hub with focused detail navigation while retaining the dense desktop rail, Quick Add uses the shared form controls, and the app rail, Mail, profile/download overlays, task rows, and AI action feedback now consume the current semantic UI tokens. Shared text inputs also use the neutral house-format focus border with no accent ring or glow.
- Reduced Focus to a distraction-free full-canvas timer with one contextual Start/Pause/Continue control. The Magic UI circular gauge now renders clock content and advances every second from the existing server-owned focus session while preserving completion, notification, and task-binding behavior underneath. Replaced the purple AI Chat CTA with a black Needt-adapted Rainbow Button whose animated color is limited to a thin border, and applied the Magic UI circular theme reveal to theme changes from navigation, profile, and Appearance settings.
- Unified page, sidebar, panel, popover, and dialog backgrounds onto one canvas color per theme with a subtle top-lit gradient limited to the first 40% of the surface. Expanded the Create Task editor and its scheduling sidebar, reorganized Advanced settings into clearly explained time, placement, and label groups, and upgraded the sidebar AI Chat action to a vivid token-based gradient CTA without glow.
- Reworked the phone shell around a native-style four-tab floating dock (To-do, Today, Focus, Me), safe-area-aware chrome, smoother persistent route transitions, and a Tiimo-inspired Today header with centered serif day typography, progress, quick add, and horizontal day swipes. Installed PWA launches now open Today, refresh their service worker without stale RSC caching, and preserve offline mutation queues across upgrades.
- Rebased both appearance themes on shared top-lit depth tokens. Dark mode now uses a neutral `#0E0E10` canvas with closely stepped `#151517` / `#1A1A1E` / `#212126` surfaces, thin neutral borders, radial page and panel depth, and a stronger top-to-bottom modal scrim; light mode supplies matching inverted depth without blur or glow.
- Completed the responsive Needt design pass for Boards, Focus, Mail, and AI Chat in both dark and light themes. Boards now separate card-open and drag handles, Focus uses a flat Opal-inspired timer hierarchy with an early-exit sheet, Mail follows the compact Inbox toolbar/row rhythm, and AI Chat shares the common composer, loading, history, and message surfaces.
- Renamed Settings → Theme to Appearance, made the mobile Me tab point to account settings, and isolated custom dark background tinting from light-mode semantic tokens so switching themes never leaves a dark inline canvas behind.
- Replaced the task description Markdown textarea with a rendered Tiptap editor supporting headings, bold/italic/underline/strike, lists, checklists, code, links, images, undo, and redo. Rich descriptions are sanitized before storage and render consistently in task quick views, Boards, and Focus while legacy plain-text and Markdown descriptions remain readable.
- Refined Calendar, Today, Create Task, and Space as one coherent Needt UI pass: 12-hour grid labels now use `1 PM` spacing, the current-time dot is smaller, working hours use the plain canvas while non-working hours receive the optional quiet tint, Today uses a centered day/date hierarchy with time-of-day task groups, and the full task editor consumes shared theme tokens with a functional description-formatting toolbar.
- Made Space a purely exploratory environment: its darker animated star canvas and compact controls remain draggable and zoomable, but moving task nodes no longer rewrites or freezes their scheduling fields.
- Finished the remaining Settings tabs with the shared Motion-style row, card, picker, switch, loading, and advanced-section patterns; Theme, Timezone, Notifications, API, Privacy, AI Assistant, Schedules, Desktop, and Account now share the same responsive user-facing layout.
- Finished the ordinary-user Settings experience around Motion's measured layout: matching calendar account/group dialogs, compact auto-scheduling choices, searchable task pickers, integration cards, a unified canvas background, and collapsed advanced-only controls.
- Removed System and Logs from the user Settings navigation and replaced calendar credential error panels with quiet provider availability feedback.
- Rebuilt Settings around the measured Motion layout: a compact 230px navigation rail, 57px page header, dense token-based rows, and shared Needt controls throughout.
- Moved existing Needt-only features into the closest Settings homes without dropping functionality: task sync under Integrations, connector tokens and webhooks under API, import/export and retention under Privacy, and advanced energy rules under Auto-scheduling.
- Rebranded the application shell, metadata, PWA assets, AI copy, local calendars, and documentation from Flowday to Needt through the shared app configuration.
- Replaced the inherited root landing page with an auth-aware redirect to Calendar or Sign In.
- Consolidated Needt into one production build by removing edition-specific routing, file variants, feature gates, repository sync tooling, and the legacy worker scripts.
- Unified Workspace and Calendar control styling through one shared compact toolbar contract, and moved Space zoom into a small canvas control with cursor-anchored wheel zoom.
- Removed the Space Inbox cluster and orbit rings: tasks without a project now float independently, project centers use compact neutral labels, and lightweight star layers drift and pulse without a JavaScript animation loop.
- Upgraded Workspace into a practical mission-control view: readable project constellations and task chips, Today/7-day/14-day horizons, search and project focus, workload metrics, an inline task inspector, and an explicit calendar-aware drag-to-reschedule grid. The simplified Task List now surfaces today, overdue, and workload context while keeping advanced controls optional.
- Rebuilt Workspace around the Solo-focused `Space`, `Task List`, and `Timeline` views, removed the legacy project sidebar, and simplified the default task table to the six fields most users need while keeping additional fields optional.
- Reworked calendar quick-create with the shared Needt popover, input, control, and focus tokens; matched the current-time dot/rule to Motion and aligned hour labels directly with their horizontal grid lines.
- Restyled the calendar task-actions menu and Start task dialog with the shared Needt menu, dialog, control, and status tokens.
- Moved the today-only task list above the sidebar mini-calendar, removed its redundant heading/count, and replaced the accent start control with a compact neutral action button.
- Established the finished Calendar palette and controls as the Needt design system, with primitive, semantic, and component tokens, theme-ready root switching, and shared buttons, inputs, pickers, menus, dialogs, switches, checkboxes, and tooltips consuming the same source of truth.
- Matched calendar toolbar controls to Motion's exact 25px height and 13px type, while restoring a configurable multi-color accent palette instead of forcing the interface to one graphite color.
- Aligned the week header/time gutter with Motion and added a compact gridded all-day rail.
- Refined calendar working and non-working hour shades while preserving the current-day hierarchy and consistent one-pixel grid lines.
- Rebuilt the full Create task editor around Motion's measured 1016×767 desktop frame, with a 696px editing canvas, 320px scheduling sidebar, matching property groups, templates, recurrence, and collapsed advanced settings.
- Rebased the calendar canvas and time gutter on the shared canvas token, with subtle stepped shades for non-current working and non-working hours while preserving every grid line.
- Rebuilt calendar task and event cards in Motion’s grid language: tasks are neutral, checkbox-led blocks with compact time metadata and a hover actions affordance; events retain a restrained color marker and their own event-specific layout.
- Matched the Task and Event editors more closely to Motion’s actual layouts: Task now uses a wide, borderless editing canvas with property rows in the scheduling sidebar; Event uses Motion’s compact single-column creation flow with time controls, repeat controls, and Event details below.
- Reorganized Settings into grouped Calendars, Scheduling, Tasks, Appearance, Notifications, AI, Integrations, Import / Export, and Account pages; legacy hashes now route to their consolidated home.
- Moved calendar display and working-hour controls out of Calendars so calendar account/default-calendar settings have a single home.
- Consolidated calendar account management under Calendars, added an Account profile page, and restyled Tasks, Notifications, Import / Export, Integrations, and Logs with consistent Motion-style settings rows.
- Removed duplicate legacy energy and work-hours editors so scheduling rules have one source of truth; Appearance now owns the calendar working-hours display toggle.
- Moved the AI Chat button from the top of the sidebar to the bottom-left, just above the profile/settings row (keeps the pill styling and ⌘/ label)
- Made switching between app sections instant: the calendar route no longer blocks on a server-side query of every event on each navigation. It now renders as a static, prefetched route and hydrates from the persistent in-memory calendar store, revalidating in the background — so revisiting the calendar shows cached data immediately with no spinner or flash

### Fixed

- Restored reliable Board card opening by moving drag listeners onto a dedicated handle and including task tags in Board detail payloads for the shared task editor.
- Prevented development service workers from serving stale client bundles after HMR or reload, and kept authenticated navigation off auth, setup, and Settings routes where it could trigger unrelated feature requests.
- Hardened the post-reland feature seams: the sidebar AI pill and Cmd/Ctrl+/ now open the chat overlay, elapsed Focus sessions keep their completion prompt, Flow sessions preserve their completion status after reload, and task deadline inputs retain local wall-clock time.
- Made optional integrations fail soft: the billing client no longer throws at module import without Creem configuration, Redis-backed enqueue/realtime publishing becomes a guarded no-op in the web process, SSE reconnects back off while Redis is unavailable, and unconfigured Google/Outlook calendar and Mail actions render as neutral disabled states.
- Added controlled logging/error responses around Boards, Focus, and Mail routes plus feature-local Mail and Boards render fallbacks, so an isolated provider or database failure does not blank the app or escape as an unhandled route rejection.
- Recomputed Outlook sync windows per request and parsed opaque delta tokens safely, instead of freezing the date range at module import or retaining trailing query parameters.
- Added a SavedView-to-Board foreign key with `SET NULL` cleanup, completed the customization/token rebrand defaults, and kept the integrated CalendarWebhook, Mail, Focus, Boards, AgentMemory, and AiUsage schema additive.
- Split the shared app-session context from its provider component so Settings, account controls, and admin checks consume the same stable client export without a Turbopack runtime mismatch.
- Unified client session reads behind one provider so the sidebar keeps a skeleton during authentication instead of flashing an empty avatar or Sign In action.
- Prevented mount-time FullCalendar selections from opening quick-create without an explicit user click or drag.
- Kept Timeline task bars inside their project rows and aligned them to the date grid, with muted completed tasks and hatched weekend columns.
- Fixed Coolify production images omitting build-time dependencies during `npm ci`, and kept the pinned Prisma 6 CLI in runtime dependencies so container startup cannot download an incompatible Prisma major before migrations.
- Escape and outside-click now dismiss calendar quick-create and clear its temporary FullCalendar selection instead of leaving the draft block behind.
- Calendar tasks now open their full editor on click, while their checkbox completes them directly without opening the editor.
- Made Refresh all tasks run the scheduler, reload the calendar, animate the updated layout, and report success or rollback errors clearly.
- Fixed the current-time indicator gap, removed the extra time-gutter divider, and added matching open/close motion to the Create Task / Event menu.
- Kept hourly grid rules visible above working-hours overlays, made every all-day cell consume the shared canvas token with four-sided dividers, and removed the redundant main-calendar date controls.
- Reset the calendar to the real current day after a new session, prevented week changes from remounting the whole view, and made mini-calendar arrows move exactly seven days.
- Hid the empty Today tasks placeholder, included tasks scheduled for today, and based urgency color/order on the explicit deadline before the due-date fallback.
- Matched the Calendar Options weekday picker to its panel background and replaced the oversized create dropdown with a compact two-action menu in the calendar palette.
- Fixed the Week calendar's full task editor occasionally refusing to close because its grid-creation state remained active after Close, Cancel, or Escape.
- Fixed the command palette keeping an invisible modal scroll lock mounted after closing, which could prevent calendar scrolling and pointer interaction.
- Fixed calendar task quick views for auto-scheduled chunks: click handlers now resolve the underlying task id instead of the generated calendar-block id, and the popover anchors to the clicked item.
- Removed the wide highlighted band that appeared across the whole hovered hour in the calendar (the app-wide `table tbody tr:hover` highlight was bleeding into FullCalendar's timegrid rows); the thin Motion-style dashed cursor guide is now the only hover affordance
- The dashed cursor guide in week view spans the full grid width (all day columns) and shows consistently over working hours, non-working hours, and every day, matching Motion
- Restored the calendar grid lines (hourly rows and day-column separators at `#2B2F31`, half-hour lines hidden) and added Motion-style column shading: the current-day column stays flat `#202425`, while other days show a two-step tint — working hours `#24282A`, non-working hours `#282C2E`

### Changed

- Redesigned the calendar toolbar and week grid to match the Motion reference: the header now shows a compact "Mon YYYY" title, and the right side groups a "Calendar options" menu (24-hour time, start week on Monday, highlight working hours), a "Refresh all tasks" action, a "+" new-event button, and a single "Week" view-switcher dropdown (replacing the separate Day/Week/Month/Year buttons). Week day headers now read "Mon 6" and a timezone abbreviation is shown in the top-left axis corner

### Added

- Import tasks from CalDAV servers (Baikal, Nextcloud, Fastmail, etc.): a connected CalDAV account's task collections (calendars that expose `VTODO`) can be mapped to a project and their tasks imported into FluidCalendar. Import is one-way for now - title, description, due/start dates, status, priority, and recurrence are read from the server, and an external-owned field cleared upstream (e.g. a completed task reopened) is cleared locally too so the import mirrors the server (#144)
- Create a multi-day all-day event by dragging the mouse across multiple days on the all-day row, like Google Calendar; the New Event modal opens pre-filled as an all-day event spanning the selected days (#79)
- Added `.github/copilot-instructions.md` with repository-wide guidance for GitHub Copilot's coding agent (setup, commands, architecture, SAAS/open-source separation, code-style conventions)
- Show the application version in a footer on every page, linking to the project's GitHub page (#111)
- Added a button to mark tasks as completed directly from the task quick view popup
- Added visual indicator for externally synced tasks in task list view
- Added Stripe configuration file (`src/lib/stripe.saas.ts`) for SAAS payment processing
- Lifetime access purchase feature
  - Added Stripe integration for one-time payments
  - Implemented early bird 50% discount for first 50 purchases
  - Added lifetime access status tracking for users
  - Created webhook handler for Stripe events
  - Added server actions and API routes for purchase flow
- Lifetime access subscription plan with special early bird pricing
- Server actions for handling lifetime access purchases
- Early bird discount for first 50 lifetime subscribers ($200 instead of $400)
- Lifetime Access subscription plan with early bird pricing
  - Early bird offer: $200 for first 50 subscribers
  - Regular price: $400 after early bird period
  - Includes all Pro features with perpetual access
- Lifetime subscription success page with modern design and animations
- New reusable PageHeader component for consistent page headers
- Enhanced payment success flow with session verification
- New success page for lifetime subscription purchases
- API endpoint to verify Stripe checkout sessions
- Refactored the lifetime subscription success page (`src/app/(saas)/subscription/lifetime/success/page.tsx`) to use the new pattern for `searchParams` and `params` as Promise types, updating usages accordingly.
- Added a password setup page at /subscription/lifetime/setup-password for new users after successful payment (SAAS only).
- Updated the 'Set Up Your Account' button on the lifetime success page to redirect to the password setup page.
- The 'Set Up Your Account' button now sends name and email in query params to the password setup page, which displays them if present.
- Implemented backend API route and service for password setup at /subscription/lifetime/setup-password/api (SAAS only).
- Added client service to call the backend API for password setup.
- Integrated password setup form with the backend using Tanstack Query, including loading, error, and success states.
- Made `/subscription/lifetime/success` route public in middleware so it no longer requires authentication after successful payment.
- Made `/subscription/lifetime/setup-password` route public in middleware so users can set their password after payment without authentication.
- Enhanced lifetime subscription success page with automatic user verification and redirection
- Added subscription status verification and automatic updates for existing users
- Improved payment verification with early bird discount detection
- Updated LifetimeSuccessPage and LifetimeSuccessClient to show 'Go to login' or 'Go to Calendar' for existing users after successful lifetime subscription payment, based on whether the user is logged in or not. The setup button is now only shown for new users.
- Added a dismissible "Buy Lifetime Access" banner at the top of the main calendar/dashboard view for SAAS users who have not purchased lifetime access. The banner links to /beta for payment.
- The "Upgrade to Lifetime Access" banner is now only shown if the user does not have a lifetime subscription. Added `/api/subscription/lifetime/status` endpoint for this check.
- Fixed "Upgrade to Lifetime Access" banner to remain hidden initially until verification confirms user doesn't have lifetime access, preventing banner flash for lifetime subscribers
- Added Asia/Karachi to the timezone options in user settings
- Improved calendar rendering performance with Server Components
  - Added server-side pre-fetching of calendar feeds and events data
  - Modified client components to hydrate with server-fetched data
  - Reduced client-side data loading operations and API calls
  - Eliminated loading delay for initial calendar view rendering
- Updated application logo to use SVG format instead of PNG for better quality
  - Replaced inline SVG calendar icons with the logo.svg file
  - Updated favicon configuration to use the SVG logo
  - Added SVG icon support in metadata
  - Made logo background transparent for better display on different colored backgrounds
  - Optimized logo viewBox for better visibility at small sizes in browser tabs
  - Added explicit size hints in metadata for better browser rendering
  - Added logo to main navigation bar with app name for better branding

### Changed

- Upgraded the runtime from Node.js 20 to Node.js 22 (LTS): updated `.nvmrc`, both Docker base images, bumped `@types/node` to v22, and added an `engines.node >=22.11.0` constraint to `package.json`
- Removed "Upcoming:" prefix from due dates in task views to reduce confusion with the "upcoming" label used for tasks with future start dates
- Updated future task detection to consider tasks as "upcoming" only if they are scheduled for tomorrow or later
- Added new `isFutureDate` utility function in date-utils
- Improved date formatting in task views to consistently show "Upcoming" label for future tasks
- Fixed task overdue check to not mark today's tasks as overdue
- Modified auto-scheduling to exclude tasks that are in progress, preventing them from being automatically rescheduled
- Updated User model to track lifetime access status
- Added new LifetimeAccessPurchase model for purchase tracking
- Updated success URL in checkout session to include session ID
- Improved UX for payment success confirmation
- Updated lifetime subscription checkout to use Stripe price IDs instead of inline product data
- Added new environment variables:
  - `STRIPE_LIFETIME_EARLY_BIRD_PRICE_ID`: Price ID for early bird lifetime access
  - `STRIPE_LIFETIME_REGULAR_PRICE_ID`: Price ID for regular lifetime access
- Updated verifyPaymentStatus to include additional payment information
- Improved error handling and logging in subscription flow
- Improved SAAS/open source code separation:
  - Renamed subscription-related files to include `.saas.ts` extension:
    - `/src/lib/actions/subscription.ts` → `/src/lib/actions/subscription.saas.ts`
    - `/src/lib/services/subscription.ts` → `/src/lib/services/subscription.saas.ts`
    - `/src/lib/hooks/useSubscription.ts` → `/src/lib/hooks/useSubscription.saas.ts`
    - `/src/app/api/subscription/lifetime/route.ts` → `/src/app/api/subscription/lifetime/route.saas.ts`
    - `/src/app/api/subscription/lifetime/status/route.ts` → `/src/app/api/subscription/lifetime/status/route.saas.ts`
    - `/src/app/api/subscription/lifetime/verify/route.ts` → `/src/app/api/subscription/lifetime/verify/route.saas.ts`
    - `/src/app/(saas)/subscription/lifetime/success/page.tsx` → `/src/app/(saas)/subscription/lifetime/success/page.saas.tsx`
  - Updated all imports referencing these files to use the new paths
  - Created separate implementations of components with SAAS-specific code:
    - Split `LifetimeAccessBanner` into `.saas.tsx` and `.open.tsx` versions
    - Modified Calendar component to use dynamic imports based on `isSaasEnabled` flag
    - Removed direct SAAS imports from common components

### Fixed

- Fixed deleting a single occurrence of a recurring Google Calendar event removing the wrong instance: single-occurrence deletes re-queried Google for the "next upcoming" instance (`timeMin: now`, `maxResults: 1`) and deleted that, so deleting a past or non-next row could silently delete a different (often future) occurrence. Single-mode deletion now targets the clicked occurrence directly. Affects all calendar views and pushed task blocks (#199)
- Fixed the Tasks list so sorting by the Priority or Energy column orders rows by meaning (low < medium < high) instead of alphabetically by label; tasks with no priority/energy (including the "None" priority) sort to the end (#131)
- Fixed CalDAV connection failures (unreachable server, DNS error, connection refused/timeout, or an untrusted/self-signed TLS certificate) being reported as "Failed to authenticate with CalDAV server. Please check your credentials." When the underlying failure is a network/TLS problem, the Test Connection, Connect, and calendar-discovery flows now return a connection-oriented error ("Could not connect to the CalDAV server. Please check the server URL, your network/firewall, and the server's TLS certificate.") with an HTTP 502, while genuine credential rejections still show the credentials message with HTTP 401. This stops sending users with Radicale/Nextcloud/Baikal down the wrong debugging path (#122, #117, #115)
- Fixed being unable to connect a second CalDAV server when its username matched one already connected: the account uniqueness constraint was `(userId, provider, email)` and CalDAV stores the login username in `email`, so two different CalDAV servers sharing a username collided and the second connection failed with a misleading "Incorrect credentials" error. CalDAV account identity now includes the server URL (`(userId, provider, email, caldavUrl)` with `NULLS NOT DISTINCT`), so multiple CalDAV servers can be connected even with the same username; OAuth providers (Google/Outlook) are unaffected and still allow only one account per email. Re-adding the exact same server now returns a clear "already connected" message instead of a credentials error (#145)
- Fixed the Docker quick-start being unreachable on `http://localhost:3000` when the operator's `.env` contained an unrelated `PORT` (e.g. `PORT=80`) or `HOSTNAME` (e.g. `localhost`): `docker-compose.yml` forwarded the whole `.env` into the app container, and the Next.js standalone server binds to `HOSTNAME:PORT`, so the app bound to the wrong address/port while compose still published `3000:3000`. The `app` service now pins `PORT=3000` and `HOSTNAME=0.0.0.0`, so the published port always reaches a listening server; the README quick-start documents that `PORT`/`HOSTNAME` in `.env` do not change where the app binds (#151)
- Fixed connecting a personal Microsoft account (outlook.com / hotmail.com / live.com, Microsoft 365 Personal/Family) to Outlook failing with `profile-fetch-failed` after a successful sign-in; these accounts return `mail: null` from Microsoft Graph, so the account email now falls back to `userPrincipalName`. The "Connect Outlook" button is also no longer disabled when no Tenant ID is set (tenant is optional and defaults to `common`), and the Outlook redirect URI in the README, `docs/_old/outlook.md`, and the self-hosting checklist is corrected to the path the app actually uses (`/api/calendar/outlook`) (#97)
- Corrected the Google Calendar OAuth setup instructions so the README and the in-app System Settings panel agree: both now document the two required redirect URIs (`/api/auth/callback/google` for sign-in and `/api/calendar/google` for calendar connect), and the README adds troubleshooting for the common `redirect_uri_mismatch`/"Invalid Redirect" failures (`NEXTAUTH_URL` must match the public URL; bare private IPs and `.local` hosts are rejected by Google) (#76)
- Fixed CalDAV events created or updated in FluidCalendar appearing at the wrong time in other calendar clients (Thunderbird, Home Assistant) when their timezone differs from the server's. Timed events are now serialized with an explicit timezone (`DTSTART;TZID=<zone>` plus a generated `VTIMEZONE`, falling back to UTC `Z` when no timezone is known) instead of floating local time, so recurring events also keep their wall-clock time across DST and the `TZ` environment-variable workaround is no longer needed (#135)
- Fixed creating and updating all-day events on CalDAV servers (Baikal, Nextcloud) failing with an error; the generated iCalendar no longer emits an invalid duplicated `VALUE=date;VALUE=DATE` parameter on `DTSTART`/`DTEND` (#100)
- Fixed the "Hide upcoming tasks" filter on the Tasks list so it hides exactly the tasks marked "Upcoming"; it now uses the same day-granularity rule as the "Upcoming" badge instead of an instant comparison that also hid tasks starting later today (#109)
- Auto-Schedule settings time dropdowns (Working Hours and energy-level ranges) now honor the 12h/24h preference from General settings instead of always showing 24-hour times (#129)
- Improved all-day event UI by removing time selection when "All day" is checked, showing only date picker instead
- Fixed Google Calendar event deletion by adding missing userId parameter for authentication
- Fixed Outlook task sync issues with recurring tasks
- Fixed Caldav feed failing to add when syncToken is an integer
- Fixed: Updated Stripe checkout session success_url in lifetime subscription API to use double curly braces ({{CHECKOUT_SESSION_ID}}) so users are redirected to the success page after payment.
- Fixed lifetime subscription error toast to show the actual error message ("User already has lifetime access") instead of generic "request failed with status code 400" message.
- Fixed name input in account setup page after payment to allow users to enter their complete name without the input disappearing after first character.
- Fixed infinite login redirect loop in staging environment by:
  - Correcting the login URL from "/login" to "/auth/signin" in lifetime success page
  - Adding explicit handling in middleware to redirect "/login" to the correct authentication route
  - Preventing redirect loops between /auth/signin and /setup pages by improving middleware and setup check logic
  - Adding special handling in middleware to detect and break circular redirects
- Fixed edge case where sign-in button remained visible after user logged in by adding proper session loading state handling in UserMenu component
- Fixed calendar page authentication to use JWT tokens instead of session-based authentication, maintaining consistency with the rest of the application
- Fixed authentication in subscription API routes by replacing session-based auth with JWT tokens:
  - Updated `/api/subscription/lifetime/status` to use getToken instead of getServerSession
  - Updated `/api/subscription/lifetime/verify` to use getToken instead of getServerSession
  - Updated `/subscription/lifetime/success` page to use JWT token authentication
- Fixed all linting errors related to usage of 'any' in API routes for subscription lifetime status and verify endpoints.
- Refactored usage of getToken in (saas) subscription lifetime success page and API routes to use NextRequest and proper cookie handling.
- Replaced console.log with logger.error in (common)/calendar/page.tsx for proper logging.

### Removed

## [1.3.0] 2025-03-25

### Added

- Comprehensive bidirectional task synchronization system with support for Outlook
  - Field mapping system for consistent task property synchronization
  - Recurrence rule conversion for recurring tasks
  - Intelligent conflict resolution based on timestamps
  - Support for task priorities and status synchronization
- Password reset functionality with email support for both SAAS and open source versions
- Smart email service with queued (SAAS) and direct (open source) delivery options
- System setting to optionally disable homepage and redirect to login/calendar
- Daily email updates for upcoming meetings and tasks (configurable)
- Resend API key management through SystemSettings

### Changed

- Enhanced task sync manager for true bidirectional synchronization
- Improved date and timezone handling across calendar and task systems
- Moved sensitive credentials from environment variables to SystemSettings
- Replaced Google Fonts CDN with self-hosted Inter font
- Updated API routes to follow NextJS 15 conventions
- Split task sync route into SAAS and open source versions
  - Moved background job-based sync to `route.saas.ts`
  - Created synchronous version in `route.open.ts` for open source edition

### Fixed

- Multiple task synchronization issues:
  - Prevented duplicate task creation in Outlook
  - Fixed task deletion synchronization
  - Resolved bidirectional sync conflicts
  - Fixed task mapping and direction issues
- All-day events timezone and display issues
- Various TypeScript and linter errors throughout the task sync system

### Removed

- Legacy one-way Outlook task import system and related components
- OutlookTaskListMapping model in favor of new TaskListMapping
- RESEND_API_KEY from environment variables

## [1.2.3]

### Added

- Added task start date feature to specify when a task should become active
  - Tasks with future start dates won't appear in focus mode
  - Auto-scheduling respects start dates, not scheduling tasks before their start date
  - Visual indicators for upcoming tasks in task list view
  - Filter option to hide upcoming tasks
  - Ability to sort and filter by start date
- Added week start day setting to Calendar Settings UI to allow users to choose between Monday and Sunday as the first day of the week
- Expanded timezone options in user settings to include a more comprehensive global list fixes #68
- Bulk resend invitations functionality for users with INVITED status
- Added "Resend Invitation" button to individual user actions in waitlist management

### Changed

- Updated email templates to use "FluidCalendar" instead of "Fluid Calendar" for consistent branding
- Refactored task scheduling logic into a common service to reduce code duplication
  - Created `TaskSchedulingService` with shared scheduling functionality
  - Updated both API route and background job processor to use the common service
- Improved SAAS/open source code separation
  - Moved SAAS-specific API routes to use `.saas.ts` extension
  - Renamed NotificationProvider to NotificationProvider.saas.tsx
  - Relocated NotificationProvider to SAAS layout for better code organization
  - Updated client-side code to use the correct endpoints based on version

### Fixed

- Fixed type errors in the job retry API by using the correct compound unique key (queueName + jobId)
- Fixed database connection exhaustion issue in task scheduling:
  - Refactored SchedulingService to use the global Prisma instance instead of creating new connections
  - Updated CalendarServiceImpl and TimeSlotManagerImpl to use the global Prisma instance
  - Added proper cleanup of resources in task scheduling API route
  - Resolved "Too many database connections" errors in production

### Technical Debt

- Added proper TypeScript types to replace `any` types
- Added eslint-disable comments only where absolutely necessary
- Fixed linter and TypeScript compiler errors
- Improved code maintainability with better type definitions
- Added documentation for the job processing system
- Standardized error handling across the codebase

### Removed

- Separate one-way sync methods in favor of a more efficient bidirectional approach

## [1.2.1] 2025-03-13

### Added

- Added login button to SAAS home page that redirects to signin screen or app root based on authentication status
- Added SessionProvider to SAAS layout to support authentication state across SAAS pages
- Added pre-commit hooks with husky and lint-staged to run linting and type checking before commits

### Changed

- Removed Settings option from the main navigation bar since it's already available in the user dropdown menu
- Improved dark mode by replacing black with dark gray colors for better visual comfort and reduced contrast

### Fixed

- Fixed event title alignment in calendar events to be top-aligned instead of vertically centered
- Removed minimum height constraint for all-day events in WeekView and DayView components to improve space utilization
- Made EventModal and TaskModal content scrollable on small screens to ensure buttons remain accessible

## [1.2.0] 2025-03-13

### Added

- Added background job processing system with BullMQ
  - Implemented BaseProcessor for handling job processing
  - Added DailySummaryProcessor for generating and sending daily summary emails
  - Added EmailProcessor for sending emails via Resend
  - Created job tracking system to monitor job status in the database
- Added admin interface for job management
  - Created admin jobs page with statistics and job listings
  - Added ability to trigger daily summary emails for testing
  - Implemented toast notifications for user feedback
- Added Toaster component to the saas layout and admin layout
- Added Redis configuration for job queues
- Added Prisma schema updates for job records
- Added worker process for background job processing
  - Created worker.ts and worker.cjs for running the worker process
  - Added run-worker.ts script for starting the worker
- Added Kubernetes deployment configuration for the worker
- Added Docker configuration for the worker
- Added date utilities for handling timezones in job processing
- Added maintenance job system for database cleanup
  - Implemented MaintenanceProcessor for handling system maintenance tasks
  - Added daily scheduled job to clean up orphaned job records
  - Created cleanup logic to mark old pending jobs as failed
- Centralized email service that uses the queue system for all email sending
- Task reminder processor and templates for sending task reminder emails
- Email queue system for better reliability and performance

### Fixed

- Fixed TypeScript errors in the job processing system:
  - Replaced `any` types with proper type constraints in BaseProcessor, job-creator, and job-tracker
  - Added proper type handling for job data and results
  - Fixed handling of undefined values in logger metadata
  - Added proper error handling for Prisma event system
  - Fixed BullMQ job status handling to use synchronous properties instead of Promise-returning methods
  - Added proper null fallbacks for potentially undefined values
  - Fixed type constraints for job data interfaces
  - Added proper type casting with eslint-disable comments where necessary
- Fixed meeting and task utilities to use proper date handling
- Fixed worker deployment in CI/CD pipeline
- Fixed job ID uniqueness issues by implementing UUID generation for all queue jobs
  - Resolved unique constraint violations when the same job ID was used across different queues
  - Replaced console.log calls with proper logger usage in worker.ts
- Fixed job tracking reliability issues
  - Reordered operations to create database records before adding jobs to the queue
  - Improved error handling and logging for job tracking operations
  - Added automated cleanup for orphaned job records
- Improved error handling in email sending process
- Reduced potential for rate limiting by queueing emails

### Changed

- Updated job tracking system to be more robust:
  - Improved error handling in job tracker
  - Added better type safety for job data and results
  - Enhanced logging with proper null fallbacks
  - Improved job status detection logic
  - Changed job creation sequence to ensure database records exist before processing begins
  - Added daily maintenance job to clean up orphaned records
- Updated GitHub workflow to include worker deployment
- Updated Docker Compose configuration to include Redis
- Updated package.json with new dependencies for job processing
- Updated tsconfig with worker-specific configuration
- Refactored date utilities to be more consistent
- Improved API routes for job management
- Enhanced admin interface with better job visualization
- Refactored all direct email sending to use the queue system
- Updated waitlist email functions to use the new email service

### Security

- Added Stripe webhook signature verification
- Secure handling of payment processing
- Protected routes with authentication checks

## [0.1.0] - 2024-04-01

### Added

- Initial release
