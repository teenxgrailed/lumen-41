# Handoff — Needt (state of 07.10.26)

Single-user planner: tasks, calendar, docs, mail, moodboards, habits, connections.
This file describes what `index.html` (desktop) and `mobile.html` (phone sheet)
**actually mount now**. Rules, data model and port order: `PORT.md`.
Per-screen status: `SCREENS.md`. UI primitives: `UI-RULES.md`.

The files are **design references** (classic-script React globals over the bound
design system), not production code. Recreate them in the target stack. Where a
value disagrees with the design system, the design system wins.

---

## Shell

| Part | Current design | File |
| --- | --- | --- |
| Top bar | sidebar toggle (left), "Open ⌘K" search (centre), notifications + help (right); in a doc: style-panel toggle at far right | `topbar.jsx`, `App.jsx` |
| Page header | every screen header carries a **"+" button** left of the title (that screen's own create) | per screen |
| Sidebar | space menu (account, Settings ⌘,) · place tiles (3-col grid) · Connections row · Pinned · Projects · Pro strip · footer | `Sidebar.jsx` |
| Tiles | default Home, Calendar, Tasks, Docs, Mailbox + **More** (Projects, Moodboards, Habits, Templates, Shared, Trash). Badges are live: Tasks = overdue count (red, explained), Mailbox = unread, Calendar = next event | `sidebar-kit.jsx` `SK_PLACES` |
| Customize Sidebar | choose tiles, show/hide/reorder sections (Pinned, Projects), drag to reorder (FLIP 200 ms); prefs in `needt.sidebar.v2` | `sidebar-kit.jsx` |
| Connections row | "N issues" in red with a tooltip naming what needs reconnecting | `Sidebar.jsx` |
| Pinned | docs with `isFavorite`; "Pin a doc" popover; rows wear the page's own face. (Was "Starred"; internal section id is still `starred`.) | `Sidebar.jsx` |
| Footer | **Focus** (labelled, larger), Import menu (Markdown, Notion, Google Docs, .ics, CSV), **Create** (right). Settings and Trash icons are removed from the footer — Settings via the space menu / ⌘,, Trash via More | `Sidebar.jsx` |
| Toggles | ⌘\ sidebar (chevron beside it opens Customize Sidebar); ⌘⌥\ doc style panel; ⌘. focus mode | `sidebar-kit.jsx`, `App.jsx` |
| Switcher | in a doc, a bottom-left switcher swaps the rail between the app's places and the doc's panel; the doc stays centred | `SidebarSwitcher` |
| Narrow (< 1100) | sidebar floats over content with a scrim; click-away / Esc closes | `App.jsx`, `app.css` |

The "+" header buttons and the footer change are being applied now (07.10.26) — treat them as the current design.

## Home (`TodayScreen` → `HomeToday.jsx`)

Built on the Tasks layout, full width, no document card.
- Header: "+", the date as title ("Tuesday, 1 September · Today · week 36"), tabs **Day | Week ahead** with counts, **Plan my day**.
- Summary cards row (project mini-card frame): **Progress** (n of m done, work left), **Next up** (Start focus / Done / Skip), **Streak** (days closed), **Habits** (chips, "2 of 4 kept").
- Left: Overdue (above the day, "Move to today"), Morning / Afternoon / Evening sections, Done today. Rows are `HdTask` (same as Tasks): quiet one-line metadata in fixed columns — time 44 · duration 52 · source 16 · project 120.
- Right rail: **Today's schedule** (events + timed tasks, now-line) and **Inbox**. Two columns from ~940 px content; below, the rail drops under the list.
- **Week ahead**: next seven days grouped by day.
- Caps: 25 rows per section + "Show all N"; schedule rail 24 rows around now.
- Prose / Canvas brief (`Brief.jsx`) survives only behind `?form=prose|canvas`.

## Tasks / Projects (`work.jsx`, `WorkScreen mode=tasks|projects`)

- **Tasks**: tabs Inbox / Today / Upcoming / All. Row of compact **project cards** (~180 wide, hue frame, progress ring, open count); clicking one **filters the list** (selected = inset ring); "No project" card too. Then the list folded by section.
- **Projects**: framed project cards (progress ring + next tasks), then each project's open tasks. Sort: manual / name / open count. New / edit project sheet: name + one of five colours.
- One project registry for Projects, sidebar and context menus (`projectStore`).
- Empty states per tab (picture, one line, one action).
- No Boards, no Kanban, no Flow, no Team.

## Calendar (`calendar2.jsx`, `CalendarCraft`)

- **Week**: seven columns, hours **07:00–21:00, 52 px/hour** (`C2_H`), red now-line. Placed tasks wear their project tint (14 %, 22 % lit) with a 3 px rail; fixed events are grey.
- Overlap (`c2Lay` / `c2Place`): clusters split into lanes while each lane stays ≥ 72 px; below that, later blocks cascade 14 px right at full remaining width; blocks starting within ~20 px of each other share side by side.
- **Block peek** (272 wide, flips near the edge) on hover / focus / click: full title, time, duration, where; actions Open, Done, Rename (inline), Delete (user events only). Undo toasts.
- Click an empty slot → **draft** block "New event", typed in place; Enter keeps, Esc drops.
- **Days**: agenda columns, **3 / 5 / 7** at a time (`needt.cal.days`), paged ‹ ›; dated tasks without an hour are listed as all-day.
- Stores: `window.calEvents` (`list / add / remove`, `needt.events`) so Mailbox and Home can add events before Calendar opens; `window.calNext()` = next event today; renamed seed titles in `needt.events.titles`.
- Prototype week is fixed (31 Aug – 6 Sep); paging beyond toasts "loads with real data".
- No Columns view, no Month, no 46 px/hour grid — those files are not mounted.

## Docs (`DocsScreen.jsx`)

- Docs grid + list; doc cards are miniatures of their own page; Pinned = `isFavorite`.
- **Document style** — one object on the doc (`Doc.style`, written by `dcSetStyle`):

| Key | Values |
| --- | --- |
| `backdrop` | none, sparkle, dunes, mist, grid (Dotted), ink (Marble), sage (Meadow), ocean |
| `page` | white, paper, rose, lilac, sage, sky, sand, graphite, black — each with a Light and Dark reading |
| `text` | auto, dark, light, umber, wine, plum, navy, forest (hues have deep/pale readings, ≥ 4.5:1) |
| `cover` | drawn art (`art:<id>`) or upload — stored top-level as `coverUrl` |
| `separator` | line, dots, wave (Hand-drawn) |
| `font` | sans (Default), serif (Newsreader), mono, rounded (Nunito) |
| `wide` | boolean |

- **All Styles** gallery (`DC_PRESETS`): Default, Paper, Ink, Rose, Sage, Ocean, Sand, Night, Sparkles, Mist — each a complete style. Old `theme` / `ground` ids map 1:1 until the first edit.
- No backdrop → the page's tint washes the app ground (ambient). Everything is drawn (SVG/CSS/canvas), no stock images.
- Inspector (style panel) toggles with ⌘⌥\; under 900 it floats over the page (272 wide).

## Connections (`connections.jsx`)

- Two tabs: **Apps & services** (what Needt reads: Gmail, Outlook, Google Calendar, Apple Calendar, Google Drive, Figma, Pinterest) and **AI tools** (what reads Needt: Claude, ChatGPT, Cursor, Gemini, Perplexity, Other MCP client).
- Toolbar: Connected / All segment, chips All · Mail · Calendars · Files, search.
- Card states (`window.connections`, event `needt-connections`): connected · disconnected (red, explained, Reconnect) · connecting · none.
- AI tools: line "**Needt MCP** — use your Needt tasks, calendar and notes in your favourite AI" + Beta; connect opens numbered **setup steps** per tool (server URL copy row, JSON config, API key for other clients).
- **Pinterest (Beta)** uses the same key Moodboards reads — connecting here or there is one state; disconnecting ends access on every board.
- Grid 3 / 2 / 1 columns (container query). Page sits in a **window inset** on the sky: 12 px gap right/bottom, 14 px corners, hairline overlay (`.nx-window`), thin scrollbar (`.nx-scroll`).

## Special screens — the printed sky (`scenes.jsx`)

Used by: Connections, Templates and Shared headers, paywall, auth/onboarding, Settings promo, sidebar Pro strip, mobile paywall.

- `PxSky` canvas sky; current look = **6A** in `_archive/labs/backgrounds.html` (archived comparison page): `horizon="cloudsea"` + `clouds="wispy"` (both defaults). 6B = haze, 6C = puff clouds (comparison only).
- **Daily mood**, one per local date per theme family — light: clear, haze, lilac, golden, silver; dark: night, slate, harbor. Debug `__skyMood`, `__skyHorizon`, `__skyClouds`.
- Cloud edges and sides dissolve into a **halftone dot screen** (4 px pitch, 12 sizes); static **paper grain** tile (128 px, opacity .03).
- Ink on the sky: `--px-ink` dark in light moods, white in dark moods, ≥ 4.5:1.
- **Glass** (`GlassCard`, `.px-glass`, from Craft's plan card): radius 26; light `rgba(255,255,255,.6)` + gradient to `.8`, `blur(4px)`, shadows `0 8px 16px -4px /.04`, `0 12px 24px -4px /.08`, `#fff` 1 px inset, `rgba(255,255,255,.6)` 1 px, `rgba(0,0,0,.19)` 1 px; `.is-strong` .72; `.is-best` ring `#1a1c1e`. Dark: `rgba(30,32,36,.55)` → `.85`, inset `rgba(255,255,255,.08)`. Segment track `.px-track` (pill, .3 white, blur 4).
- ~30 fps cap, paused off-screen, still frame under reduced motion.

## Paywall (`paywall.jsx`)

- Prices from `window.NEEDT_PRICING` (USD): **Pro $7 / month**, **Pro $59 / year** ($4.92/mo, "Best value", "Save 30%"), **Lifetime $149** — first **300** buyers, counter "212 of 300 left". **14-day free trial, no card needed.** Footnote "Prices in USD. Taxes may apply."
- Sheet on the sky: headline, glass product cards, Free as "current plan" line, three selectable glass plan cards, one CTA (trial or "Get Lifetime"), Pro features. No real checkout.
- API: `openPaywall({cycle})`, `closePaywall()`, `<Paywall phone />` for mobile. Plan state `needtPlan` (free / trial / monthly / yearly / lifetime, `needt.plan.state`), `needtPlanInfo(s)`.

## States system (`states.jsx`, `window.needtStates`)

Wraps every routed screen (`StBannerStack` + `StScreenLayer`); also used by Chat and Mobile.

| State | Values | Shows |
| --- | --- | --- |
| `load` | loading · error | skeleton per screen kind (list / grid / week / page / cards / chat); error with Retry → loading → content. Loading self-resolves in 1.2 s unless pinned |
| `offline` | bool + queue | top-bar indicator; edits queue one entry per thing edited; back online → "N changes synced" |
| `access` | shared · revoked | doc/moodboard "no access" page; revoked = Google Calendar / Gmail disconnected, banner + Reconnect |
| `conflict` | bool | doc sync-conflict banner |
| `ai` | limit · down | "AI paused until 14:00" / "AI is temporarily unavailable" banners; Plan my day and Ask Needt locked with a tooltip |
| `account` | trial-ending · trial-ended · payment-failed | banners and Pro locks (e.g. extra connections) |

- Scope: global or per screen; `pin` holds loading. Persisted in `needt.states`.
- **⌥S** toggles the switcher (pill above Ask Needt). Mobile: Settings → States.

## Ask Needt (`Chat.jsx`)

Pill "Ask Needt ⌘J" bottom right → island (notes) → panel (dock 360 wide). Reads states: loading skeleton, AI limit/down, offline ("needs a connection"), trial ended (read-only).

## Settings (`SettingsScreen.jsx`)

A sheet over the current screen, not a route. Space settings: Connections, Your day, Tasks, Focus. General: Appearance (themes **System / Light / Dark / Time** as live miniatures, accent: 6 solid + 3 gradient), Notifications, Shortcuts, Advanced. Pro card on the sky.

## Tablet (768) and window sizes

From `_tablet-report.txt` (Playwright, 1440×900 and 768×1024, no errors, no page-level sideways scroll):
- `#root` min-width floor lifted under 960; sidebar floats under 1100 with scrim.
- Home cards wrap 2×2 (Next up full row), rail under list. Tasks project cards scroll sideways. Projects grid auto-fills.
- Calendar Week → **3 days** from today, ‹ › pages 3 days. Docs grid 2 columns. Doc inspector hidden by default under 900, floats when opened.
- Mailbox stacked: list full width, message replaces it with "‹ Mailbox" back; split view ≥ 900.
- Connections 2 columns (1 under 600).
- Not applied yet: session-only doc-panel override (auto-hide currently overwrites `needt.docPanel`).

## Edge cases (`window.__edgeData`, `work.jsx`)

`__edgeData('long' | 'german' | 'empty' | 'one' | 'many' | 'nocolor' | 'reset')` swaps tasks, docs and projects in place (persists until `reset`).
- Long names ellipsize with a title tooltip (rows, cards, sidebar, doc cards); project cards clamp to 2 lines; doc titles wrap with `overflow-wrap:anywhere` + hyphens.
- Many: Home 25 rows/section, Tasks/Projects 50, schedule rail 24 + "Show all N". 500 tasks ≈ 0.9 s per screen switch.
- No colour: neutral grey frame/dot/folder.
- Empty / one: every screen has its empty state.
- Not covered by `__edgeData`: Mailbox, Moodboards, Habits, Templates, Shared, Trash (fixtures of their own).

## Mobile (`mobile.html`, `Mobile.jsx`, `MobileAuth.jsx`)

- A sheet of 27 phones (402×874, `ios-frame.jsx`; 08.10.26 added paper + dark pairs of Projects, Docs, Document, Mailbox, Habits, Trash, Task sheet): Home dark/light, composer, Settings, queue sheet, Calendar week, Calendar days, Tasks, Sign in, Create account, Setup, Paywall light/dark.
- Bottom tabs: **Home · Calendar · Tasks · Docs · Mailbox · More**. More: Projects, Moodboards, Habits, Templates, Shared, Trash, Connections. Every control ≥ 44 px; hover affordances become taps.
- Calendar uses **calendar2's model** (same blocks, `calEvents`, `c2Place`, now-line): Week = a strip of seven days over one day's hours; Days = three days stacked; ‹ › or swipe pages.
- States: same `needtStates` drawn with phone parts (44 px buttons); Settings → States replaces ⌥S.
- Pricing from `NEEDT_PRICING` (same-number fallback); paywall full-screen on the sky.
- Themes System / Light / Dark / Time via `Drift.jsx`; same accents.
- Documents on the phone read only the old preset (`style.theme`, `MB_DT` copy), not the full style model.
- `__edgeData` is not loaded on the phone (`work.jsx` is not in `mobile.html`).

## 08.10.26

- **Mailbox**: the place is called Mailbox in every visible label; ids / routes / files stay `mail`.
- **AI orb** (`AiOrb.jsx`, `window.AiOrb {size, tile, label}`): a glowing sphere on a soft tinted round tile, in the place-glyph family. Fixed sky iridescence (blue → lilac → pink, tokens `--orb-*` in `themes.css`, light + dark), never the accent. The film turns every 9 s, the halo breathes every 7 s; one still frame under reduced motion (`styles/base.css`). Used by the Ask Needt pill, chat header and messages, the Brief header and Needt author marks, the phone's header button, More row and Ask sheet.
- **Calendar density**: ≤ 3 overlapping blocks side by side on the desktop, ≤ 2 on the phone; the rest go into a "+N" chip in their half hour (gutter on the cluster's right) that opens the slot list (`C2SlotPop` / phone sheet). Days folds a slot past the cap into a "+N more at HH:MM" row.
- **Connections store** moved to `stores.jsx`; `window.connections.authorize(provider)` is the mock OAuth onboarding uses (desktop and phone, `useCalConnect`). New `ocal` (Outlook Calendar). Synced events carry `source` google / apple / outlook and are not deletable in Needt.

## Kept from earlier rounds (still true)

- **Drag** (`Drag.jsx`): ghost is the real object, landing drawn before drop, refusal names the obstacle.
- **Composer** (`Composer.jsx`): one line parses date, time, duration, project, priority; verdict as chips first; "+" shelf.
- **Notifications**: `window.__notify({kind, title, body, when, acts, ms, sticky})`, stack above the pill, hover pauses dismiss.
- **Agent cursor** (`AgentCursor.jsx`): minimum-jerk `10t³−15t⁴+6t⁵`, duration `clamp(210 + 190·log₂(d/90+1), 300, 760)` ms, one quadratic bezier fixed up front, `translate3d` writes, emerges from and returns to the chat corner.
- **Keyboard**: one table `NEEDT_KEYS` drives handler and the printed sheet (⌘K, ⌘N, ⌘⇧F, ⌘⇧P, G+letter, ?).
- **Motion**: 0.15 s hover, 0.25 s theme crossfade; entry animations never hold state (`animation-fill-mode` not `both` on broad selectors); everything off under reduced motion.

## Assets and open items

- **Exposure** (wordmark + display) — owner holds a licence; replace the prototype's `ExposureTrialVAR.woff2` with the licensed files in code.
- **Newsreader / Nunito** — doc Serif / Rounded fonts, loaded from **Google Fonts** at runtime; self-host or confirm terms.
- No stock photography; sky, covers and backdrops are drawn.
- Bound design system: `../_ds/needt-design-system-main-25d3c8e5-a812-464d-881f-e887b9adef4b/`.
