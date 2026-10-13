> **FROZEN 09.10.26** — the prototype is final; see FROZEN.md. Further work happens in the new web repo.

# Needt — porting brief

What `index.html` and `mobile.html` actually mount today (07.10.26), what to
build, in what order. Read with:

- `SCREENS.md` — screen → files → status. **Port only screens marked ready.**
- `HANDOFF.md` — per-subsystem detail (calendar, docs, sky, states, pricing…).
- `UI-RULES.md` — buttons, scale, states, colour roles. Port as-is.

Anything not mounted by `index.html` / `mobile.html` is not the product — see
"Do not port" in `SCREENS.md`.

---

## 0. Rules that must not drift

1. **Greys are one text colour at a ladder alpha.** Text 100/85/70/55/40/25, fills 2/3/4/6/8/12. No new greys.
2. **Chrome type is 13 / 12 px.** 16 px is document body.
3. **Accent is never a solid fill on a button or surface** — only marks (switch knob, status dot, now-line, progress).
4. **One form row:** `--form-label-w: 105px`, rows 32 px. A long label is shortened, never the column widened.
5. **Elevation is ring-first.** Dark/dim themes override `--shadow-raised*` as a directional bevel (`themes.css`); keep it one override.
6. **Info text ≥ `--text-tertiary`.** Quaternary/muted only for decoration, done items, placeholders (UI-RULES).
7. **One fact, one home.** `Data.js` owns dates, projects, people, habits, tasks; `NEEDT_PRICING` owns prices; `window.needtStates` owns screen states.

## 1. Stack

- Prototype = classic `<script type="text/babel">` globals; load order in `index-dev.html` (the source page — `index.html` is built from it, §5a) is the dependency graph. Port to **Next.js + React + Tailwind** with ES modules; drop the `C2_*`, `WK_*`, `CN_*`, `PX_*`… prefixes (they exist only to avoid global clashes).
- Design-system tokens/components from `../_ds/needt-design-system-main-…` (`styles.css`, `_ds_bundle.js`). Do not recreate DS components.
- Icons: `needt-icons.js` + `vendor/lucide-local.js` are prototype shims → import glyphs directly in the app.
- Themes (Settings → Appearance): **System, Light, Dark, Time** (Time = theme that follows the sun, `Drift.jsx`). Accent picker: 6 solid + 3 gradient.

## 1a. One program — sync, platform, entry (09.10.26)

Needt ships as **one program**: iOS / Android in a Capacitor shell, macOS / Windows in a Tauri shell, the same pages in a browser. The shells come later (checklist at the end of this section); what exists now is the layer they will sit on. Owner decisions: a **sync layer now, backend later**; **one entry** that picks the phone or desktop UI.

### Entry — `app.html` (built) / `app-dev.html` (source)

- Loads the shared base (React, DS bundle, `cssvar.js`, `sync.js`, `platform.js`, `Data.js`, `brand-icons.js`) and `app-boot.js`, which picks the UI with `needtPlatform.ui()`: **phone** on iOS / Android or a window narrower than **700 px**, **desktop** otherwise; `?ui=phone|desktop` overrides (and pins it).
- Mounts into `#needt-app` (not `#root`, so `App.jsx` does not mount itself): desktop = `App` as `index.html` draws it; phone = `V2pLivePhone bare` (full screen, no device frame) wearing the shared theme (`needtSettings.theme`, resolved by `v2pResolveTheme`).
- Crossing 700 px (resize, rotation) switches UI **in place**: the other UI's code loads once, the same React root re-renders, `<html>`'s classes / vars are reset for the new UI, the other UI's stylesheets are disabled. Data is never lost — every store lives outside both UIs and persists through `needtSync`. (The current place is not carried over: desktop opens on Home, the phone on Home.)
- **What loads** comes from the two dev pages, nothing is listed twice: `app-dev.html` reads `index-dev.html` / `mobile-dev.html` (their `<link rel=stylesheet>` and `<script src>` tags, in order — inline scripts such as the phone page's frame and the measure harness are not the program) and compiles each `text/babel` file in the browser with Babel's own options. `build.js` turns the same lists into `build/app.desktop.js` (desktop core, index order), `build/app.phone.js` (phone core, mobile order), `build/app.desktop.only.js` / `app.phone.only.js` (the same minus what the other UI's core already ran — used after a switch), and the desktop's lazy groups `build/app.<group>.js` (needt-lazy). A desktop lazy file the phone core also needs (`paywall-sheet`, `ExposureWordmark`, `Habits`) is desktop core here, so no file ever runs twice. Measured: the phone downloads `app.phone.js` and no desktop code; the desktop downloads `app.desktop.js` + its lazy groups and no phone code.
- `index.html` / `mobile.html` stay as previews (the phone page keeps its frame and Light / Dark switch).
- `window.needtApp` → `{ ui, switchTo(ui), ready }`.

### Sync — `window.needtSync` (`sync.js`)

One adapter every store persists through. The bytes still live in localStorage under the old keys in the old shapes (nothing that reads storage broke); a write is diffed into record changes, stamped, queued and pushed through a transport, and changes from elsewhere are merged and handed back to the stores, which re-render.

| Call | What |
| --- | --- |
| `get(key, fallback)` · `getRaw(key)` | the stored value (parsed) · the raw string |
| `set(key, value, { origin, source, raw })` → `true \| false` | write (no-op when unchanged; `false` = storage full). `origin`: `local` (default), `migrate`, `legacy`; `source`: a token a binding uses to skip its own echo |
| `update(key, fn)` · `remove(key)` | |
| `subscribe(key \| "*", fn(value, info))` | `info = { key, origin: local \| legacy \| migrate \| remote \| error, source, changes }` |
| `collection(key)` | `list · get(id) · put(record) · patch(id, p) · remove(id) · subscribe · meta(id) → { id, updatedAt, deletedAt, rev, by }` |
| `bind(store, key, { load, save })` | glue for a `makeStore`-shaped store: persists every set, takes every change from elsewhere |
| `use(key, fallback)` | React hook `[value, set]` |
| `register(key, def)` · `defOf(key)` | the schema (Data.js registers `NEEDT.schema`) |
| `setTransport(t)` · `flush()` · `outbox()` · `status()` | transport; `status() = { transport, pending, lastError, cursor, device, tab }` |
| `mergeInto(key, list, changes)` | apply record changes to a list (for a store whose state lags its writes) |

**Key kinds** (`NEEDT.schema` in `Data.js`): `collection` — an array of rows, one id each (`idOf` when the row has no `id`); changes are per row. `map` — an object, each field its own record (settings, connection states, event title overrides). `value` — one value, last write wins as a whole. `local: true` — kept on this device only, never sent (the open doc, a panel, a tab, a secret). `raw: true` — a bare string, not JSON. Unregistered keys persist but never sync.

**Record metadata.** Every synced row has `{ id, updatedAt, deletedAt, rev }` (+ `by` = `device:tab`). In the prototype they live beside the data — `needt.sync.meta.<key>` = `{ recs: { <id>: [updatedAt ms, rev, by, deletedAt ms | 0] }, at, rev, by, orderAt, orderBy }` — so the stored rows keep their shape. A deleted row keeps its stamp as a tombstone (`deletedAt`) for 30 days. **In the database these are columns on every synced table**: `id`, `userId`, `updatedAt`, `deletedAt` (soft delete), `rev`, `updatedBy`.

**Change** (what travels): `{ key, op: "put" | "del" | "order" | "set" | "remove", id, value, ids, at, rev, by }` — `put` carries the whole row, `order` the list's id order (a collection's order is its own record, stamped `orderAt`), `set` / `remove` a whole value key.

**Conflict rule — last write wins, per record.** A change wins when its `at` (ms) is later; same `at` → higher `rev`; same `rev` → larger `by` string. Every device decides ties the same way. A row is the unit (two fields of one task edited on two devices at once → the later edit's whole row wins); maps merge per field; an order nobody names keeps unknown ids at the end. Clocks: `at` is the device clock, made monotonic per tab; the server should restamp on receipt if skew matters (then `at` = server time, `rev` breaks ties).

**Outbox.** Local changes queue in order; a microtask after every write calls `flush()` → `transport.push(batch)`; on success the batch leaves the queue (and the returned `cursor` is kept), on failure it stays and retries with backoff 1 s → 30 s. A `durable` transport's queue is kept in `needt.sync.outbox` (survives a reload offline).

**Transport interface.** `{ name, durable, pull(since) → Promise<{ changes, cursor }>, push(changes) → Promise<{ cursor }>, onRemote(fn(changes)) → unsubscribe, start?(), stop?() }`.
- `LocalTransport` (default): every tab of the origin shares localStorage, so what travels is the change list — `BroadcastChannel("needt-sync")`; without it, `storage` events are diffed into record changes stamped from the writer's saved metadata. Desktop and phone open in two tabs update each other **live** (tasks, projects, docs, boards, habits, mail, settings + theme / accent, connections + sync stamps, calendar events + title overrides, templates, plan + dismissed cards, sidebar, chats, doc sharing, sorts, notes for the day).
- `RemoteTransport({ baseUrl, socketUrl, token })` — stub with TODOs in `sync.js`, `durable: true`. **Contract for the backend:**
  - `GET /v1/sync?since=<cursor>` → `{ changes: Change[], cursor }` — `since` empty = every live row (first sign-in on a device).
  - `POST /v1/sync` `{ device, changes: Change[] }` → `{ cursor, rejected: [{ key, id, reason }] }` — the server applies the same rule, stores rows + stamps, never echoes to the sender; a rejected change comes back as a corrective change on the socket.
  - `wss://…/v1/sync/socket?cursor=<c>` — server → client `{ type: "changes", changes, cursor }` for every change made on another device; after a reconnect the client pulls from its last cursor first.
  - Key → table map is `NEEDT.schema` (below). Files (covers, board images) are data URLs today; in the backend they become uploads (`POST /v1/files` → URL) and the row keeps the URL.

**Data schema per collection** (fields: §2; stamps above on every row):

| Key | Table | Kind · id | Row fields (timestamps in the row) |
| --- | --- | --- | --- |
| `needt.tasks` | Task | collection · `id` (number today — UUID in the DB) | §2 Task; `trashedAt` (ISO) |
| `needt.projects.all` | Project | collection · `id` (`ops`… seeds, `p-<base36>`) | `{ id, name, color, icon, ground }`; `needt.projects` (the user's own) is derived — drop it in the DB |
| `needt.projects.sort` | UserSettings.projectSort | value | `manual \| name \| open` |
| `needt.docs` | Doc | collection · `doc-<base36>` | §2 Doc; `trashedAt`; `updated / viewed / created` labels → from `updatedAt` / `viewedAt` / `createdAt` |
| `needt.templates` | Template | collection · `id` | `{ id, title, style, body, label, meta }` (the user's own) |
| `needt.habits` | Habit | collection · `h-<base36>` | §2 Habit; `archivedAt` |
| `needt.habitCheckins` | HabitCheckin | collection · `habitId\|date` | `{ habitId, date, done }` |
| `needt.events` | Event | collection · `u<base36>` / `sync-<provider>-n` | §2 Event; `startAt`, `endAt` |
| `needt.events.titles` | EventOverride | map · event id | title (write back to the provider in the real API) |
| `needt.mail.threads` | MailThread | collection · `id` | §2 MailThread; `receivedAt`, `trashedAt` |
| `needt.boards` · `needt.boardItems` · `needt.boardMembers` | Board · BoardItem · BoardMember | collection · `id` · `id` · `boardId\|email` | §2; `createdAt`, `trashedAt`, `pinterestSyncedAt` |
| `needt.chats` | Chat | collection · `c-…` | `{ id, title, at, messages[] }` |
| `needt.settings` | UserSettings | map · field | `stores.jsx SETTINGS_DEFAULTS` keys + `mobileTiles`, `sidebarTiles`, `calHideDone`… |
| `needt.theme` · `needt.accent` | UserSettings.theme / .accent | value | mirrors of `settings.theme` / `.accent` (App reads them first) — one column each, drop the mirrors |
| `needt.connections` · `needt.connections.sync` | Connection | map · provider id | state `connected \| disconnected \| connecting \| none` · sync options |
| `needt.mcpLinks` · `needt.apiLinks` | AccessLink | collection · `lnk_…` | `{ id, name, url, scope, permission, access, projectIds, createdAt }` |
| `needt.plan.state` | Subscription | value | `free \| trial \| monthly \| yearly …` (server-owned in the real API) |
| `needt.sidebar.v2` · `needt.docsSort` · `needt.mbSort` · `needt.docShare` | UserSettings | value | layout / sorts / share settings |
| `needt.focus.log` | FocusSession | value (append log, last 400) | one row per session — a collection in the DB |
| `needt.dayNotes.<day>` · `needt.upsellDismissed.<id>` · `needt.promo.dismissed` | DayNote · UserFlags | value | |
| local only | — | — | `needt.openDoc`, `needt.docPanel(.v2)`, `needt.cal.days`, `needt.connections.tab`, `needt.phone.theme`, `needt.states`, `needt.mcp.key` (secret), `needt.sidebarTiles.applied` |

**Who writes through it — everyone (09.10.26).** Nothing writes a `needt.*` key into localStorage directly any more, so the old `Storage.setItem / removeItem` shim in `sync.js` is **gone**, and so are the bridges at the end of `stores.jsx`. Each store persists with `needtSync.bind` / `set` and takes changes from elsewhere (another window, the phone store after a UI switch, later the server) through the same key — so it re-renders live:

| File | Keys | How (writes · changes from elsewhere) |
| --- | --- | --- |
| `stores.jsx` | docs, open doc, settings (+ theme / accent mirrors), habits + checkins, mail, the three board tables, projects, connections, MCP / API links | `bind` · `bind` |
| `Mobile.jsx` | `mbTaskStore` (tasks), doc / connections fallbacks; `mbPrefStore` is a *view* of `needtSettings` | `bind` · `bind` |
| `App.jsx` | `needt.tasks` (state + effect, `source` token) · theme / accent (through `needtSettings`) · `needt.docPanel` (local) | `set` · `subscribe` → record merge with `mergeInto` (App's state lags its write) · `subscribe("needt.settings")` → `setTheme / setAccent` on a remote change |
| `calendar2.jsx` | `needt.events` (`c2Store`), `needt.events.titles` (`c2Titles`), `needt.cal.days` (local) | `bind` · `bind` |
| `places.jsx` | `needt.templates` (`plTplStore.mine`), `needt.mbSort` | `bind` (save/load `mine`) · sort: `subscribe` |
| `paywall.jsx` | `needt.plan.state`, `needt.upsellDismissed.*`, `needt.promo.dismissed` | `set` · `subscribe` (plan subscribers; `pwUseFlag` hides a card dismissed elsewhere) |
| `sidebar-kit.jsx` | `needt.sidebar.v2` (`skStore`) | `bind` (`load` = `skMerge`) |
| `Chat.jsx` | `needt.chats` | `set` (`CHAT_SRC` token) · `subscribe` → the list, and the open thread's messages unless a reply is streaming; an unchanged thread is not re-saved (no echo) |
| `connections.jsx` / `connections-data.js` / `phone-places.jsx` | `needt.connections.sync`, `needt.connections.tab` (local), `needt.mcp.key` (local) | `set` · sync stamps: `subscribe` |
| `DocsScreen.jsx` / `phone-docs.jsx` | `needt.docsSort`, `needt.docShare`, `needt.docPanel(.v2)` (local) | `set` · sort: `subscribe`; share: `subscribe` → `needt-docshare` event |
| `focus.jsx` | `needt.focus.log` | `set` · read on use |
| `mobile-v2-plates.jsx` | `needt.dayNotes.<day>` | `set` / `remove` · `subscribe` (the field follows) |
| `states.jsx`, `Sidebar.jsx`, `phone-settings.jsx`, `mobile-dev.html` | `needt.states`, `needt.sidebarTiles.applied`, `needt.phone.theme` (all local) | `set` |
| `SettingsScreen.jsx`, `phone-settings.jsx` (Reset) | every `needt.*` key | `needtSync.resetAll()` — each key sent as `remove`, then the sync metadata / outbox cleared |

Settings have **one writer**: `needtSettings.set(k, v)` — `phone-settings.jsx psSet`, `phone-places.jsx pplSettingSet`, `nav-a.jsx nvaSetPref` and `MobileAuth.jsx maMenuSave` no longer also write `mbPrefStore`.

### Platform — `window.needtPlatform` (`platform.js`)

Feature-detects the shells (`window.Capacitor` with `isNativePlatform()`, `window.__TAURI__` / `__TAURI_INTERNALS__`); nothing is installed; every call has a browser fallback.

| Member | Capacitor | Tauri | Browser |
| --- | --- | --- | --- |
| `kind` | `ios` \| `android` | `mac` \| `windows` | `web` |
| `shell` | `capacitor` | `tauri` | `browser` |
| `os` | from the UA, in any shell | | |
| `isPhone` | true | width < 700 | width < 700 |
| `ui()` | `?ui=` override, else `isPhone ? "phone" : "desktop"` | | |
| `haptic(kind)` | `Haptics.impact / notification / selectionChanged` | — | `navigator.vibrate` |
| `share({ title, text, url })` → `{ ok, via }` | `Share.share` | clipboard | `navigator.share`, else clipboard |
| `pickFile({ accept, multiple })` → `File[]` | hidden `<input type=file>` (works in both webviews; swap for the dialog / file-picker plugins when native paths are needed) | | |
| `notify({ title, body, at })` → `{ ok, via }` | `LocalNotifications.schedule` | `notification.sendNotification` | `Notification` (asks once), else `toast` |
| `safeArea` | `{ top, right, bottom, left }` px from `env(safe-area-inset-*)`, kept current | | |
| `openExternal(url)` | `Browser.open` | `opener.openUrl` / `shell.open` | `window.open(…, "noopener")` |
| `copy(text)` · `onChange(fn)` | clipboard · fires on resize / rotation when `isPhone` or the safe area changes | | |

**Call sites (09.10.26).** Haptics (`phone-drag` lift = `medium`, `phone-habits` ×2 / `phone-kit` hold = `light`), the doc share (`phone-docs` page ⋯ → `share()`; the clipboard fallback says "Link copied"), every clipboard write (`Chat`, `Dialogs`, `DocsScreen`, `Sidebar`, `connections`, `connections-data` `cnClip`, `ctx`, `phone-docs`, `phone-habits`, `places`) and every file picker (`Chat` attach, `Dialogs` task attach, `DocsScreen` cover, `MailScreen` / `phone-mail` / `phone-overlays` attach, `phone-docs` cover + image, `phone-habits` photos, `places` board images, `import.jsx`) call `needtPlatform` — the hidden `<input type=file>` elements are gone; a handler takes `File[]` (`[]` = cancelled, ignored). **Still on browser APIs:** `window.open` to the web → `openExternal()` (`phone-habits.jsx` link open, `places.jsx` open link; `App.jsx openInNewTab` is in-app), the clipboard *read* in `phone-habits.jsx` ("Paste from clipboard" — no `needtPlatform` read yet), the export downloads (`DocsScreen.jsx`, `connections-data.js`: `<a download>` → a save dialog in a shell). Reminders / daily-plan notifications are toasts today → `notify()`.

### Later: Capacitor / Tauri wrap (checklist — nothing scaffolded)

1. Build: `node build.js` → `app.html` + `build/` + assets is the web bundle both shells serve (rename `app.html` → `index.html` in the shell's `webDir` / `frontendDist`). Self-host React (no unpkg), the Exposure font and the Google doc fonts (§7).
2. Capacitor: `npm i @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android`, `npx cap init Needt app.needt.planner --web-dir dist`, `npx cap add ios android`. Plugins `platform.js` already calls: `@capacitor/haptics`, `@capacitor/share`, `@capacitor/local-notifications`, `@capacitor/browser` (+ `@capacitor/filesystem` / a file picker if native paths are needed). Icons: `app-icon/AppIcon.appiconset` (iOS), Android adaptive icon from `needt-icon-ios.svg`. Viewport has `viewport-fit=cover`; read insets from `needtPlatform.safeArea`. Status bar style follows the theme.
3. Tauri 2: `npm create tauri-app` (vanilla), `frontendDist` → the build; plugins `@tauri-apps/plugin-notification`, `plugin-opener`, `plugin-dialog` (+ `plugin-fs`); set `app.withGlobalTauri: true` so `window.__TAURI__` exists. Icons: `app-icon/needt.icns` (macOS), `.ico` (Windows). Window min size 960 × 720 (the desktop's floor).
4. Storage: replace localStorage with the shell's store behind `needtSync` only (Capacitor Preferences / SQLite, Tauri `plugin-store` / SQLite) — `sync.js`'s `lsGet / lsSet / lsRemove` are the only three write points (every writer calls `needtSync`; a few readers still `getItem` a key on load — move them to `needtSync.get`).
5. Backend: implement the contract above, then `needtSync.setTransport(needtSync.RemoteTransport({ baseUrl, socketUrl, token }))` after sign-in; `LocalTransport` stays for multiple windows on one desktop.
6. Deep links (`needt://doc/<id>`, `#doc/<id>` today) and the OAuth redirects for Connections: register the scheme in both shells.
7. Push (server → phone) for reminders: APNs / FCM via `@capacitor/push-notifications`; desktop uses the socket + `notify()`.

## 2. Data model (DB names)

`Data.js` renames everything to database names and migrates stored data on load (`migrateTask/Project/Doc`, `migrateHabit`, `migrateEvent`, `migrateMail`, `migrateBoards`; see `_rename-report.txt` §1 and §6).

### Task

| Field | Type / meaning |
| --- | --- |
| `estimatedMinutes` | number, minutes (was `est`) |
| `dueDate` | `"YYYY-MM-DD"` (was `due`; free text normalised by `NEEDT.toDate`) |
| `scheduledStart` | `"YYYY-MM-DDTHH:mm"` local (was `at`) |
| `scheduledEnd` | = start + `estimatedMinutes` (default 30); kept by `NEEDT.sync` |
| `projectId` | → `Project.id` (`ops`, `ds`, `german`, `resale`, `life`, `p-…`) |
| `TaskPart` | `[{id, title, done}]`, one level; ids `<taskId>.<n>` |
| `TaskWait` | `{personId, reason}` (was `waitsOn`) |
| `Stage` | `todo` \| `doing` \| `review` \| `done` (`NEEDT.stages`) |
| `isFixed` | boolean — time set by hand, planner must not move it (was `time`). **Not in DB yet** (see below) |
| `notes` | plain text (newlines kept) — the one notes field, desktop and phone (09.10.26). Older `description` (desktop HTML / phone text) and `note` are folded into it by `migrateTask` (`NEEDT.notesText` turns HTML into text) |
| `entry` | the two-minute first step — a one-line field on both task editors |
| `chunk`, `deadline`, `hardDeadline`, `hours` | scheduling: minimum work block in minutes (`null` = don't split), deadline `"YYYY-MM-DD"` (+ hard = never planned past it), `"work" \| "personal" \| "any"` |

### Project
`{id, name, color, icon}` — `color` (was `hue`), `icon` (was `glyph`; user projects default `"folder"`). Seeds: ONE list, `NEEDT.projects` in `Data.js` (ops, ds, german, resale, life — with `ground`); `stores.jsx` `PROJECT_SEEDS` is derived from it. One registry: `window.projectStore` + `window.projects` (create / rename / recolor / edit / remove with undo) in `stores.jsx` — the desktop (`work.jsx`, Sidebar, ctx menus) and the phone read the same store; localStorage `needt.projects.all` (+ `needt.projects` for the user's own, `needt.projects.sort`). It seeds on first read (seed colours need `cvProject`).

### Doc
`isFavorite` (UI label **Pinned**), `coverUrl` (data URL, `art:<id>` or null), `trashedAt` (null or ISO; trashed = non-null), `projectId`, `style` (one JSON object — see HANDOFF "Document style").

### Habit · HabitCheckin
Habit `{id, title, projectId, color, icon, schedule: {time "HH:mm" | null, perWeek n | null}, archivedAt}` — `color` null = the project's colour. HabitCheckin `{habitId, date "YYYY-MM-DD", done}` — one row per ticked (or unticked) day. The fourteen-day strip, "n of 14", "n/3 this week" and the streak are **computed** from checkins (`NEEDT.habitDays / habitKept / habitWeek / habitStreak`). Archive sets `archivedAt`. Stores: `window.habitApi` (`stores.jsx`), localStorage `needt.habits`, `needt.habitCheckins`.

### Event
`{id, title, startAt, endAt ("YYYY-MM-DDTHH:mm" local), isAllDay, calendarId, source: "needt" | "google" | "apple" | "outlook", externalId}`. All-day: `…T00:00` to the next day (end exclusive). The calendar draws `{day, at, len}` blocks from it (`NEEDT.eventBlock`, view-model only). Store: `window.calEvents` (`calendar2.jsx`), localStorage `needt.events`; synced seed `C2_EVENTS`.

### MailThread
`{id, accountId, subject, from, fromEmail, receivedAt, preview, body, attachment, isRead, isArchived, trashedAt, taskId, needsReply, suggestedTask, folder, to, cc, bcc, attachments}` — `folder` null = received, `"sent"` / `"drafts"` = the user's own (`to / cc / bcc` `[{name, email}]`, `attachments` `[{name, size, type}]`, + `text`, `inReplyTo`, `forwardOf`, `quote`); `NEEDT.liveMail` (the inbox) skips rows with a folder. The old `made / read / gone` maps are `taskId / isRead / isArchived + trashedAt` on the thread. Day heading and time are computed from `receivedAt` (`NEEDT.mailDayLabel / mailTime`). Store: `window.mailApi` (`stores.jsx`), localStorage `needt.mail.threads` — desktop and phone read the same threads. Writing mail is on the same object (`window.mailOut` is an alias): `compose(p)` / `reply(m, all)` / `forward(m)` → a draft `{id, accountId, to, cc, bcc, subject, text, attachments, inReplyTo, forwardOf, quote}`; `saveDraft(d)` → id; `send(d)` → `{id, undo}` (Sent at once; undo = back to a draft); `discard(id)` → undo; `check(d)` → what stops a send or null; `accounts()`, `suggest(q, skip)`, `folder(list, "sent" | "drafts")`.

### Board · BoardItem · BoardMember
Board `{id, title, projectId, linkShare, pinterestBoardId, trashedAt}` (+ `createdAt`, `pinterestStatus`, `pinterestSyncedAt`), BoardItem `{id, boardId, kind: image | link | color | note, url, color, text, position}` (+ `title, ratio, colorName, source, thumbnailUrl, createdAt`), BoardMember `{boardId, email, role}` (+ `name`). **Pins are never stored** — only `pinterestBoardId`. Delete → `trashedAt` (Trash lists boards). Stores: `window.boardStore` (three tables) and `window.boardsView` (boards joined with items by `position` and members — what screens draw), localStorage `needt.boards`, `needt.boardItems`, `needt.boardMembers`.

Unchanged on purpose: people (`person.hue`).

### Helpers (`window.NEEDT`)
`project(ref)`, `projectName`, `projectIdOf`, `at(task)`, `timeLabel`, `dueLabel`, `dueDay`, `toDate`, `dayLabel`, `iso`, `hhmm`, `stamp`, `sync`, `moveDay`, `placeAt`, `blocking`, `blockerOf`, `unblocks`, `streak`. `blocking/blockerOf/unblocks` are derived, never stored.
Habits: `habitDoneOn`, `habitDays`, `habitKept`, `habitStreak`, `habitWeek`, `habitTime`, `habitPerWeek`, `habitColor`, `liveHabits`, `setCheckin`. Events: `eventAt`, `makeEvent`, `eventBlock`, `eventsInRange`, `moveEvent`, `eventMinutes`, `dayIso`. Mailbox: `mailDayLabel`, `mailTime`, `liveMail`, `mailFixture`. Boards: `joinBoards`, `splitBoards`, `liveBoards`.

### New fields (not in DB yet)

| Field | Why it is needed | Source |
| --- | --- | --- |
| Task `isFixed` | planner must not move a time set by hand | user |
| `noSlot` | task belongs to no day: no rail, not in the unplaced queue | user |
| `entry` | two-minute first step ("First step") | user |
| `heat` | 0–1 intensity for the category flame | computed |
| `holder` | who holds the task (face on cards) | user (assignee) |
| `tone` | legacy accent tone for old block designs | computed from project |
| `value` | money a resale task is worth | user |
| `earned` | money already received | user |
| `movedFrom` | hour the scheduler moved it from (mark) | computed |
| `age` | days untouched; title fades past 21 | computed |
| `overdue` | past its date and open (Overdue sections) | computed |
| `blockedBy` | task that must close first (dependency chain) | user |
| `status` | To do / In progress / In review / Done label (overlaps `Stage` + `done`) | user |
| `done` | closed or not | user |
| `source` | where it came from (mail, chat) — "From …" chip | computed |
| `auto`, `hardDeadline`, `deadline`, `hours`, `kind`, `chunk`, `priority`, `notes` | Task-editor settings (desktop TaskDialog and phone PkTaskSheet write the same keys): auto-schedule, hard deadline, deadline, hours, task/event/doc, min work block (null = don't split), priority, notes (plain text) | user |
| Doc `hue` | cached project colour for cards | computed |
| Doc `updated`, `viewed`, `created` | human labels ("20 min ago") — should come from timestamps | computed |
| Doc `body` | page content as `[kind, text, extra?, fmt?]` blocks; text = rich text (spans) — shape in 3b | user |
| Task `source` `{kind: "doc", docId, quote}` | a task made from words on a page (desktop selection bar → Make a task) | user |
| Doc `style.bdLook`, `style.bdBlur` | backdrop look: faded / immersive, blurred picture (phone Page Style) | user |
| Doc `label` | folder line for Template / Shared cards without a project | computed |
| Doc `style.theme`, `style.ground` | legacy preset ids an old page still wears | user |
| Project `ground` | frame tint of the project card | user |
| Project `seed` | marks built-in projects (not written to storage) | computed |

Every stored key, its table and how it syncs: §1a "Data schema per collection" (`NEEDT.schema`). Other stores (prototype localStorage, need DB tables): event title overrides for synced events `needt.events.titles` (real API writes back to the provider), connections `needt.connections` (store in `stores.jsx`, shared by desktop, phone and onboarding; calendar ids `gcal`, `ical`, `ocal`), plan `needt.plan.state`.

## 3. What is mounted (desktop `index.html`)

Routes come from `App.jsx` (`view`):

| Route | Component (file) |
| --- | --- |
| `today` (Home) | `TodayScreen` → `HomeToday` (Tasks layout) |
| `tasks`, `projects` | `WorkScreen mode=…` (`work.jsx`) |
| `calendar` | `CalendarCraft` (`calendar2.jsx`) |
| `docs` / `doc` | `DocsScreen` / `DocumentScreen` (`DocsScreen.jsx`; seed pages, themes, styles and `DocThumb` in `docs-kit.jsx`) |
| `mail` | `MailScreen` |
| `moodboards`, `habits`, `templates`, `shared`, `trash` | `places.jsx` |
| `connections` | `ConnectionsScreen` (`connections.jsx`) |
| `settings` | `SettingsScreen` — a sheet over the current route (theme/accent lists in `settings-kit.jsx`) |
| Ask Needt | `Chat.jsx` (dock, ⌘J), not a route; its mark is `AiOrb.jsx` (sky-coloured orb, tokens `--orb-*`, never the accent) |
| Auth / onboarding | `AuthScreen`, `OnboardingScreen` (stage, not route) |
| Paywall | `paywall.jsx` (pricing, plan, `openPaywall()`, Pro badges) + `paywall-sheet.jsx` (the sheet, `PwHost`, mini prints) |

Shell: `topbar.jsx` (sidebar toggle, search, notifications, help), `Sidebar.jsx` + `sidebar-kit.jsx`, `ctx.jsx` (right-click menus), `search.jsx` (⌘K palette), `Dialogs.jsx` (task dialog), `Composer.jsx`, `Drag.jsx`, `Notifications.jsx`, `AgentCursor.jsx`, `stores.jsx` (doc store, toasts), `popovers.jsx` (`RichMenu`), `import.jsx`, `states.jsx`.

**Gone:** Columns view / 46 px-per-hour grid (`CalendarScreen.jsx`, `ColumnsScreen`), Workspace with Flow/Team/Kanban, Boards, "Starred" (now **Pinned**). Home's Prose/Canvas brief (`Brief.jsx`) is only reachable via `?form=prose|canvas`.

**No longer mounted (port-prune, 09.10.26):** `BlockDesigns.jsx`, `RichBlock.jsx` and `CalendarScreen.jsx` are out of every page (originals in `_archive/port-prune/removed/`, the list in `_archive/port-prune/pruned.txt`). `ColumnsView.jsx` is mounted only for helpers — `cvProject` (project lookup, used widely; `RB_PROJECTS` / `RB_NEUTRAL` moved here from RichBlock) and `cvDur` (Dialogs); the views (`ColumnsView`, `CvCard`, `CvColumn` …) are gone. Port the helpers into the data layer.

## 3a. The phone (`mobile.html`, 08.10.26)

ONE live phone, not a sheet of frames: `mobile-dev.html` renders `V2pLivePhone` (`mobile-v2-plates.jsx`) — the "Plates" material for every place, menu A (`nav-a.jsx`, `window.NeedtNavA`) over it; on a narrow viewport the device frame goes and the app is the screen. Sign out → Sign in (`MobileAuth.jsx` `MbAuth`) → Setup (`MbSetup`) → Home.

| File | What |
| --- | --- |
| `phone-kit.jsx` + `styles/phone-kit.css` | the kit (API in the file's top comment): `PkScreen` (large title → compact title over the top blur band, bottom fog behind the pill, pull-down), `PkPullDown`, `usePkPlate` (the class a plate wears — light: inverse plate; dark: `pk-muted` raised surface, only the primary keeps full contrast; the `PkPlate` component is gone), `PkButton`, `PkField`, `PkNumber` (rolling digits), `PkSection`, `PkRow` / `PkTaskRow` (swipe right = done, left = tomorrow; lead · one open button · action), `usePkExit`, `PkChips` (blurred edges), `PkSheet` (detents, swipe-down physics, footer pinned at lower detents), `PkScrim`, `PkFog` (its halftone drifts while visible — `pkFogLive`, see 3b), `PkTopBand`, `PkBlurLayers`, `PkEmpty`, and `pkDay` — the one copy of the day rules (sections, Next up, toggle / update / create(parsed fields) / later / trash / moveOverdue) |
| `mobile-v2-plates.jsx` | Home, Calendar (event detail = `PkEventSheet`), the shell `V2pLivePhone` (screen, Ask, paywall, auth, `away` for menu A) and `V2pScreens` (the screen + the task sheet, composer, snack) |
| `phone-overlays.jsx` | `PkTaskSheet` (First step `entry`; Scheduling card → picker sheets writing `isFixed`/`auto`, `chunk`, `deadline` + `hardDeadline`, `hours` — the desktop TaskDialog's keys; notes = `notes`), `PkComposer` (coParse line + attachments → `pkDay.create`), `PkAsk`, `PkSnack`, `PkPaywall` (the sky paywall in a sheet), `PkEventSheet` |
| `phone-tasks.jsx` | Tasks (Inbox / Today / Upcoming / All), Projects + a project's page (`window.projects`) |
| `phone-docs.jsx` | Docs list (sort = `doc-style.jsx` `dcSortDocs` / `dcReadSort`, the desktop's `needt.docsSort`) and `PdDocReader` (draws `Mobile.jsx` `MbDoc*`) |
| `phone-mail.jsx` | Mailbox + thread sheet (`window.mailApi`) |
| `phone-habits.jsx` | Habits (`habitApi`, `hbKeptOn` from `Habits.jsx`), Moodboards (list in Plates, boards / items = `Mobile.jsx` `MbmRoot`; an open item calls `onCover`) |
| `phone-places.jsx` | Connections (sync = `stores.jsx` `CN_CAL_SYNC` / `cnCalOn`, written through the settings dual write), Templates (`docs.fromTemplate`), Shared, Trash |
| `phone-settings.jsx` | Settings (wave 3) — `window.PkPlaces.settings`, the desktop's settings object (see 3b) |
| `phone-drag.jsx` | long-press drag and drop of rows (`pdAttach`, used through `phone-tasks.jsx` `usePtkDrag`; zones `data-pd-zone`) — Tasks, Home |
| `Mobile.jsx` | what is left of the old phone: formatters, the phone's stores (`mbTaskStore`, `mbPrefStore`, connections, edge data), Calendar data (`mbCalData`), the doc reader page, Moodboards, Ask answers, states glyphs. The old phone (tab bar, More, top chrome, `MbHome` … `MbTrash`, `MbTask`, `MbComposer`, `MbAsk`, `MbSettings`, `MobileApp`) is `_archive/Mobile.legacy.jsx` (+ `_archive/mobile.legacy.css`) |
| `mobile-nav.jsx` | `mnTiles` / `mnCounts` for menu A (`mobile-nav.html` redirects to the phone) |

**Places registry.** A place registers `window.PkPlaces[id] = Component` and gets `{ tasks, onOpen(task), onFocus(task), say(text, undo?), pull, screen, onCover(bool), onUpgrade(feature?), onTheme("light"|"dark"), onSignOut(), onScreen(id) }`; ids: home, calendar (in `mobile-v2-plates.jsx`), tasks, projects, docs, mail, habits, moodboards, connections, templates, shared, trash, settings. Ask lives in menu A (`onScreen("ask")` opens it). A place without the props sends the same hooks as cancelable window events — `needt:upgrade` (detail = feature), `needt:theme` (detail = "light"|"dark"), `needt:signout`, `needt:go` (detail = place id); `V2pLivePhone` listens and calls `preventDefault()` when it handled one. Nothing presses menu A's buttons through the DOM. `say` is the snack; `pull` is the tasks pull-down (search + add to today) a place may use or replace; `onCover(true)` = a full-screen layer is up, menu A steps aside.

**Rules for the port.** One copy of every rule: day logic in `pkDay`; projects, templates, calendar sync, doc sort and habit history in the shared files above. Blur bands must not sit under an ancestor with opacity / filter / mask / clip-path — fade them through `--pk-*-k` vars. Z-order: bands 9, rows 1, menu 45, pull-down 50/51, overlays 55, sheets 60.

## 3b. Phone wave 3 (09.10.26) — what was added and where it lives

**Kit additions (`phone-kit.jsx`, API in its top comment).**
- `PkGlyph place|kind size tone` (the coloured section glyph tile — screen headers `PkScreen glyph=`, section heads `PkSection glyph=`, empty states, rows), `PkGlass` (frosted surface). (`PkChip`, `pkPlaceHue` were removed in the port-prune pass.)
- `PkSkyPlate` (a plate whose ground is the brand sky), `PkSkyBadge` (small sky vignette), `pkSkyMood(theme)` (mood by time of day), `PkSweep` / `pkDotSweep` (one-shot halftone sweep).
- Fog halftone dots (PkFog, menu A card fog) drift right → left forever while visible — the owner's one exception to "nothing loops at rest" (09.10.26): port as a compositor-only transform loop (~23–40 s, seamless 8-cell offset), paused when hidden / off-screen / faded out, static under reduced motion; `pkFogLive(el)` replaces the removed scroll-driven `pkFogDrift` (see MOTION).
- `PkSheet from=… onShut` — a sheet that grows out of a rect and goes back into it; `pkPillRect` is menu A's pill (the composer).
- Hold → actions, moved here from `Mobile.jsx`: `PkHold` (450 ms long press / right click → `onHold`), `PkActions` (the glass action sheet, `acts = { title, meta, head, actions: [...] }`), `PkHueTile`, `pkOwnGesture(pointerId)`. (The old `MbHold` / `MbActSheet` / `MbHueTile` / `mbOwnGesture` window aliases are gone — use the Pk names.) Classes `pk-hold`, `pk-acts`, `pk-act*`, `pk-hue-tile` (`styles/phone-kit.css`).
- `PkSheet` keeps a closed sheet fully off screen when its `detents` (or its content height) change while it is shut.

**Settings place (`phone-settings.jsx`).** The same settings as the desktop, one object: every control writes `needtSettings` (`stores.jsx`, `needt.settings` through `needtSync`); `mbPrefStore` (`Mobile.jsx`) is a view of the same store since 09.10.26 (§1a) — `psSettingsSet` / `mbSetPref` are the one rule (Connections' calendar sync, menu A and onboarding write through it too); their old second write into `mbPrefStore` is now a no-op. Pages: Account · Plan & billing · General · Appearance (theme, accent, sky) · Your day · Tasks · Focus · Notifications · Menu (`mobileTiles`, the pill's three places) · Sidebar (`sidebarTiles`) · Connections (opens the place) · Data & privacy · Shortcuts · About · Sign out. The shell follows live: the pill's tiles re-read `mobileTiles` on every settings change, and the live phone wears `data-accent` from the `accent` setting.

**Docs editor and the doc body shape (`phone-docs.jsx` ⇄ `DocsScreen.jsx`).** Doc `body` is `[kind, text, extra?, fmt?]`:

| kind | slot 2 (text) | slot 3 (extra) |
| --- | --- | --- |
| `p` `h` `li` `quote` `callout` `code` `lead` | rich text | `p`: `{ muted }` |
| `todo` | rich text | `true` = done |
| `task` | title (rich text) | meta line |
| `table` | rows `[[cell]]` | — |
| `image` | data URL (or "" = empty) | — |
| `page` | linked doc id | — |
| `date` | label ("Fri 4 Sep") | — (the ISO day is `fmt.date`) |
| `rule` | — | — |

**Rich text = spans** (`doc-style.jsx`, 09.10.26). A text block's slot 2 is a plain string (no marks — every older page, unchanged) or an array of spans `[{ t, b?, i?, s?, code?, href?, color?, hl?, at? }]`: `b / i / s / code` true when set; `href` a safe link (http(s) / mailto); `color` a Choose-a-Color id (`DX_COLORS` → `--pdc2-c-<id>`); `hl` a highlight id (`DX_HLS` → `--dsp-hl-<id>`); `at` a **mention** — the person's email, the words are "@Name". Stored canonical (`dxNorm`): equal neighbours merged, empty spans dropped, unmarked text back to a plain string (one exception: a lone empty span keeps its marks for the first words typed). Formatting is per word, not per block — the desktop's selection bar and the phone's Style sheet both write spans.

The 4th slot `fmt = { date, remind: { id, label }, task: { id, title }, comments: [{ id, text, quote, by, at }] }` is per-block data: the date's ISO day, a reminder (the task it made), the task made from words in the block, the block's comment thread. The **old** `fmt.b / i / s / color` (block-level format) is read as marks over the whole text and written back as spans (`dxMigrateBlock`); `stores.jsx` runs `dxMigrateBody` on every doc it reads, and the first seed persists the migrated bodies once. In the DB, `fmt.comments` becomes a `DocComment` table (`docId`, block anchor, `quote`, `text`, `authorId`, `createdAt`, `resolvedAt`).

Helpers (all on `window`, all accept any rich value — string, spans or null): `toSpans(v, oldFmt?)` → spans · `dxNorm(v)` → stored form · `spansToText(v)` / `dxText(block)` → plain words (search, outline, summaries, Chat) · `dxLen` · `sliceSpans(v, a, b)` · `concatSpans(...)` · `spliceText(v, a, b, str)` (new words take the marks before them) · `marksIn(v, a, b)` · `applyMark(v, a, b, mark, value)` (`undefined` = toggle, `null` = clear) · drawing: `renderSpans(v, noLinks)` (React), `spansToHtml(v)` (an editor's innerHTML), `spansToMarkdown(v)` (export) · reading an editor: `domToSpans(el)`, `dxFromEditor(el, prev)` · offsets: `dxRangeIn(el, range)`, `dxSelect(elA, start, end, elB)` · `dxSafeHref`, `dxMigrateBlock`, `dxMigrateBody`. Classes `dx-b / -i / -s / -code / -a / -at`, `dx-c-<id>`, `dx-h-<id>` (`styles/docs.css`, loaded by both UIs).

The desktop reads and writes the same shape: `bodyToBlocks` keeps `fmt`, `src`, `ref` and any unknown slot-3 value on the block, `blocksToBody` writes them back unchanged — a page edited on either side keeps what the other set. `DocumentScreen` draws spans, the image, page link (opens the doc), date chip, reminder and task badges, the comment badge and the faded / blurred backdrop; `docs-kit.jsx` `MiniBlock` draws spans, image / page / date in cards. Selection bar (desktop): marks · Mention (people the page is shared with + everyone you have mail with → a mention span) · Comment (a thread on the block the selection starts in; a badge in the right margin opens it: reply, Resolve with Undo) · Make a task (the selected words → a task in the inbox with the page's project, `source = { kind: "doc", docId, quote }`, and `fmt.task` on the block; Undo). The phone draws mentions (same spans); it has no selection bar, so Mention / Comment / Make a task are desktop only for now (the phone's block Remind still makes a task).

Doc `style` gains `bdLook: "immersive" | "faded"` (the page colour at 62 % over the backdrop) and `bdBlur: true` (backdrop picture blurred 22 px).

**Drag model (one rule, two hands).**
- Desktop (`Drag.jsx`, `useDrag` in `App.jsx`): press + 4 px = drag; the picked node itself lifts (a clone in a fixed layer, the source hidden as the gap); rows of its list make room; targets are attributes — `data-drop="timeline"` (`data-date`, `data-start`, `data-hour-h`, `data-offset`; 15-min snap), `day`, `focus`, `project` (`data-id`, `data-label`: highlighted, tag "Move to …"), `row`. A reorder reports `{ kind: "row", id, order, fromIx, toIx }`; `App.jsx` takes the rows above / below the gap and applies the phone's time-slot rule (`ptkDropWrite`): a task in a timed list takes the slot right after the row above (its end, rounded up to 15 min), else just before the row below; a time that already sorts there is kept; untimed neighbours keep it untimed. Project drop sets `projectId`; a calendar drop (`calendar2.jsx` week / 3-day columns; task blocks are draggable too) sets `dueDate` + `scheduledStart` via `NEEDT.placeAt` (`isFixed`), the lifted card lands in the new block. All with an Undo toast. `<html>` classes: `App.jsx` swaps only the ones it owns (theme) and only the inline vars it set, so Drag.jsx's `is-drag-active` survives a re-render mid-drag; the Agenda's gaps take the pointer under `html.is-drag-active` (the old `data-c2-carry` workaround is gone).
- Phone (`phone-drag.jsx` + `phone-tasks.jsx` `ptkDropWrite`): 350 ms long press lifts the row; zones are sections (`data-pd-zone`, mode move / reorder / none); a drop writes day, project and the time slot (half hours) in one write with Undo.

**Composer from the pill.** `+` on menu A → `PkComposer` opens with `from={pkPillRect}`: the sheet grows out of the pill's rect (clip-path + radius morph) while the pill steps out (`NeedtNavA morph`); closing by tap / Esc / Create morphs back into it, a drag closes by sliding; `onShut` brings the pill back.

**Sky placements.** Sky only as an accent: Home's Next up plate and Calendar's now / next plate (`PkSkyPlate`), menu A's card (a band behind the three tiles, frosted), the Settings Pro plate, empty / finished states (`PkEmpty` → `PkSkyBadge`), the strip the pull-down reveals, plus sign-in, setup and the paywall. Clouds part under the finger (passive touch, never blocks scroll); every sky pauses off-screen, when covered and after 12 s without input.

## 4. Suggested order

1. Tokens + themes (incl. dark bevel override) + UI-RULES buttons.
2. Data models (§2) + migrations + stores (projects, docs, events, connections, plan, states).
3. Shell: sidebar, top bar, ⌘K, keyboard table (`NEEDT_KEYS` drives handler and printed sheet — one table).
4. States layer (`states.jsx` model) — every screen mounts inside it.
5. Screens marked **ready** in `SCREENS.md`, in table order.
6. Special screens (sky + glass): Connections, Templates/Shared headers, paywall, auth.
7. Interaction layer: drag, composer, Ask Needt, notifications, agent cursor.

## 5. Performance rules (measured)

1. Coalesce pointer work into one rAF; publish nothing when point/target unchanged.
2. No `getBoundingClientRect()` inside `pointermove` — cache, invalidate on scroll/resize.
3. Observe containers, not every card.
4. Read "where we are" from a ref, not a stale closure (`goScreen`).
5. Sky (`scenes.jsx`): drifts only while the page is in use — 20 fps on full skies (> 500k px), 24 fps on small ones (hover: 30 fps / display rate). At rest (no pointer / key / wheel / touch input for 12 s, one shared idle detector, passive listeners) the drift speed eases to 0 over 1.5 s and the sky stops scheduling frames (last frame stays painted, zero CPU); any input eases it back up over 0.8 s — ease the speed, integrate position and clock, never reset time. Paused when hidden/off-screen/covered; one still frame under reduced motion.

Motion per screen (durations, curves, triggers, reduced motion, rule breaks): see `MOTION.md`.

## 5a. Build — precompiled JSX, production React, lazy screens (08.10.26)

`index.html` and `mobile.html` are **generated**; edit `index-dev.html` / `mobile-dev.html` and the sources, then run:

```
cd needt-app && node build.js          # ~30 s; --no-minify for readable output
```

- **Sources stay as they are.** `*-dev.html` load every `.jsx` through in-browser Babel and the React development build — open them to debug and to see React warnings. `build.js` needs `@babel/standalone@7.29.0` + `terser` in `../node_modules` (`cd .. && npm i @babel/standalone@7.29.0 terser`); the project folder has no node_modules.
- **Same semantics.** Each text/babel script is compiled with the exact options babel-standalone 7.29's `transformScriptTags` uses (presets `react` + `env` with no targets → ES5 and `"use strict"`; plugins class-properties, object-rest-spread, flow-strip-types) — output is byte-identical to the browser's. `env` turns top-level `const`/`let` into `var`, which is what lets the scripts share one global scope and repeat names (`const { Icon } = …` in many files). The build refuses to join two scripts that declare the same function differently.
- **The one program** (09.10.26): the same run writes `app.html` from `app-dev.html` — `build/app.desktop.js`, `app.phone.js`, `app.desktop.only.js`, `app.phone.only.js` and the desktop lazy groups `build/app.<group>.js`, with the manifest `window.__NEEDT_APP` in the page (§1a).
- **Output.** `build/index.core.js` (core scripts, minified, joined in page order, `defer`), `build/index.<group>.js` per lazy group, `build/mobile.core.js`; index source maps (`*.js.map`). React/ReactDOM → `*.production.min.js` (18.3.1, unpkg); no Babel. Every local asset gets `?v=<content hash>`.
- **Lazy groups** (`data-lazy="…"` on a script in `index-dev.html`; loaded by `needt-lazy.js`, prefetched one per idle slot ~0.6 s after `load`): `auth` (ExposureWordmark, AuthScreen; needs `paywall`), `paywall` (paywall-sheet), `settings` (SettingsScreen; needs `mail`), `docs` (DocsScreen; needs `import`), `mail` (MailScreen), `places` (Habits, places; needs `docs`), `connections`, `help` (Help, Bug), `import`. `build.js` works out, per group, which components the core renders by name (stand-ins that load the group and show `StSkeleton` for a screen, nothing for a sheet), which functions it calls (`FN_STUB`: `needtImport`, `mailEdge` — load, then call), and which window events the group listens to at load (`needt-mail`, `needt-edge` — held and replayed). Anything else the core reads from a lazy file fails the build: move it to a core script (as `docs-kit.jsx`, `settings-kit.jsx`, `paywall.jsx` were split) or guard it.
- **Rule for new code:** a core script must not read a lazy file's value at load time; at render time, components are fine (stand-ins), values are not. `window.__NEEDT_NO_PREFETCH = true` before load turns prefetch off to test on-demand paths.

Measured (local server, 1440×900, cold, median): first content 9.8 s → 0.8 s; main-thread busy until then 9.2 s → 0.35 s (scripting 8.8 s → 0.13 s); bytes before first content 3.0 MB → 1.5 MB (2.3 MB once all groups are prefetched; uncompressed — the dev server does not gzip). `mobile.html`: 7.4 s → 2.2 s (measured when it was the 30-phone sheet; scripting 4.8 s → 0.4 s).

## 5b. App icon (08.10.26)

"Swing" (S1 from `app-icons-v2/`): bold black n (straight stem + slanted swing leg) on a lavender→pearl squircle, flat, with a soft glow rising from the bottom edge. Everything lives in `app-icon/`; the SVGs are the source, every PNG is rendered from them.

- **Master SVGs** — `needt-icon.svg` (squircle, transparent corners), `needt-icon-dark.svg`, `needt-icon-tinted.svg` (iOS 18 dark / tinted looks); `needt-icon-small.svg` (favicon cut: letter drawn larger so it holds at 16–48 px); `*-ios.svg` (full-bleed square, the system masks it); `needt-icon-macos.svg` (824 px tile on the 1024 macOS grid, soft shadow).
- **PNG** — `png/needt-icon-{1024,512,256,180,167,152,128,120,87,80,64,60,58,40,32,29,20,16}.png` (transparent corners; ≤32 use the small cut).
- **Web** — `favicon.ico` (16+32+48), `favicon/favicon-{16,32,48,192,512}.png`, `apple-touch-icon.png` (180, opaque full-bleed).
- **macOS** — `needt.iconset/icon_16x16.png … icon_512x512@2x.png`, `needt.icns`.
- **iOS** — `AppIcon.appiconset/` with `Contents.json` (iOS 18 single-size: `AppIcon-1024.png` any, `AppIcon-dark-1024.png` luminosity dark, `AppIcon-tinted-1024.png` luminosity tinted; all opaque, no alpha).
- **In the UI** — `app-icon.jsx` → `window.NeedtAppIcon({ size, className, label })` (`<img src="app-icon/needt-icon.svg">`, classes `.needt-app-icon` / `.needt-lockup` in `styles/base.css`). Placed beside the wordmark on Sign in / Sign up / Reset (52), onboarding top bar (40), paywall next to the "Needt Pro" kicker (44, desktop + phone), phone sign-in / reset (44) and `auth.html`. Not the sidebar profile (that is the user's avatar). Pages link `favicon.ico` + `needt-icon-small.svg` + `apple-touch-icon.png`.

## 6. Where the prototype still lies

- Scheduler ("Plan my day") is scripted; two-minute entries and risk copy are authored strings.
- The week is fixed to 31 Aug – 6 Sep 2026 (today = Tue 1 Sep); paging past it toasts "loads with real data".
- No server: all persistence is localStorage, through `needtSync` (§1a) — live between windows of one browser, a stub transport for the backend. Connections, Needt MCP (`https://mcp.needt.app/u/…`) and checkout are mocks.
- The phone (`mobile.html`) is one live phone with in-memory screen state (no URLs / deep links); the device frame is a presentation wrapper.

## 7. Open items before release

- **Exposure font** — owner holds a licence. The prototype loads `ExposureTrialVAR.woff2`; in code, swap in the licensed font files (same family name).
- **Newsreader** and **Nunito** (doc fonts Serif / Rounded) load from **Google Fonts** at runtime (`doc-style.jsx dcLoadFonts`) — self-host or confirm.
- Part counter "1/2" on task rows (`HdTask`, Home / Tasks / Projects) uses `--text-muted` (contrast 2.5 light / 3.4 dark) — breaks rule 6; should be `--text-tertiary`.
- ~~Onboarding "How you work" (`AuthScreen.jsx` `VIEWS`, `MobileAuth.jsx`) still offers the removed **Columns** view.~~ **Resolved 08.10.26** — onboarding no longer has a view step; `VIEWS` is Week / Agenda only and the start view is Week.
- ~~Mobile document reads only the old `style.theme` presets (`MB_DT`), not the full doc style model.~~ **Resolved 08.10.26** — the style model (tables, `dcStyleOf`, `dcVars`, backdrops, fonts, covers) lives in `doc-style.jsx`, loaded by both dev pages; the phone (`Mobile.jsx` `MbDoc`) reads the same `Doc.style` + `coverUrl` through it. Old `theme` / `ground` ids resolve to a full style in `dcStyleOf` on both.
- `_tablet-report.txt` App.jsx suggestions not applied (doc-panel auto-hide overwrites the saved preference).
