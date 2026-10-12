# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
