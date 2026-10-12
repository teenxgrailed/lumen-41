# Design v3 port — task plan (desktop day 1, phone days 2–3)

Source: `docs/port/prototype/` in this repo (below: `$P`; frozen 2026-10-09 from `Needt - Design : App, Landing/needt-app/`). Read first: `$P/PORT.md`, `$P/SCREENS.md`, `$P/MOTION.md`, `$P/UI-RULES.md`. Reference render: serve `$P` and open `$P/index-dev.html#screen/<view>` (views: `today tasks projects calendar docs mail moodboards habits templates shared trash connections settings`) and `$P/mobile-dev.html`.

## 0. Corrections to the skeleton, from the code

| Finding | Consequence |
| --- | --- |
| The prototype was untracked in the main checkout. | **Resolved 2026-10-09:** frozen copy committed at `docs/port/prototype/` (no builds, no trial font; `index.html`/`mobile.html` are not included — open `index-dev.html`/`mobile-dev.html`). Read-only. |
| A September port already exists: `src/components/needt/**` (old bundle "Content height and label fixes"), tokens vendored by `scripts/sync-design-tokens.mjs` into `src/styles/needt-*.css` under the `.needt-v2` scope, guarded by `scripts/check-design-tokens.mjs`. | The new design gets its **own scope `.needt-v3`** and its own folder. Re-vendoring into `.needt-v2` would restyle every flag-off screen. Old code stays untouched until the flag is flipped and the contract step deletes it. |
| `isFeatureEnabled(key, userId)` (`src/lib/feature-flags.ts`) is server-only (Prisma, `crypto`) and per user. Precedent: `editor_v2` in `src/app/(app)/pages/[id]/page.tsx`. | The flag is read once per request on the server. It reaches the client through a context. No client fetch of flags. |
| Removed in the new design but live in `src/`: Workspace (Flow/Team/Kanban, `needt/workspace/**`), Columns/Sequence/Minutes (`needt/calendar/ColumnsScreen.tsx` …), Brief/Prose/Canvas Home forms (`needt/home/BriefBoard.tsx` …), the old phone (`needt/mobile/**`, `NeedtMobileTabs`). | They are not ported. They stay behind flag-off only. |
| Routes missing in `src/app/(app)/`: habits, templates, shared, trash, connections. Today, connections are `settings#integrations`. | New routes, rendered only when the flag is on (they `notFound()` when it is off). |
| Prototype runtime layers: `sync.js`, `platform.js`, `app-boot.js`, `build.js`, `needt-lazy.js`, `cssvar.js`, `ios-frame.jsx`. | **Do not port these.** Persistence = existing API + TanStack Query. Lazy loading = `next/dynamic`. Platform = a thin `src/lib/needt3/platform.ts` (clipboard, file pick, share, `openExternal`) with web implementations only. |
| Most data already has columns: `Task.scheduleLocked` (= `isFixed`), `entry`, `noSlot`, `valueCents`, `previousScheduledStart` (= `movedFrom`), `globalStage` (= `Stage`), `TaskPart`, `TaskWait`, `Page.isFavorite/coverUrl/trashedAt`, `Habit.at/archivedAt`, `Moodboard.archivedAt`, `PageTemplate`, `Subscription`, `LifetimeHold`. | Migrations in hour 1 are small and additive (T03). |
| `feat/needt-notifications` (#66) touches `needt/corner/**`. | **Resolved 2026-10-09:** merged into `port/integration` (not main; its visual baselines change). |
| Prototype key table bug: `NEEDT_KEYS` labels `G W` "Workspace", but `GO` maps `gw→projects` and `gt→tasks` (`$P/App.jsx:51-68`). | Port as `G P` Projects and `G T` Tasks. One table drives both the handler and the sheet. |

## 1. Branches, worktrees, flag

- Integration branch: `port/integration`, cut from `origin/main` at `3c4a71e` with #66 merged in. Merging into `main` = production deploy, so it merges **only with the flag off for everyone**.
- Streams: branches `port/<task-or-stream>` from `port/integration`, each in its own worktree, one handoff each in `.agents/handoffs/`. Workers: Claude (S1 foundations, review, integration) and Codex (screen streams). PRs target `port/integration`; Claude reviews and merges.
- Flag key: `design_v3`. Rollout 0 %, override for the owner's user id.

## 2. Shared contracts (frozen at 1:00; a change after that goes through the S1 handoff)

### 2.1 Tokens and CSS
- Names are exactly the DS / `themes.css` names: text ladder `--text-primary/secondary/tertiary/quaternary/muted/disabled/placeholder`; fills `--fill-1…6`, `--fill-accent(-strong)`, `--fill-destructive(-strong)`, `--fill-success`, `--fill-info`; surfaces `--surface-canvas/card/raised/floating/popover/sheet`; `--shadow-raised(-hover/-pressed/-press)`; `--ring-accent`, `--ring-destructive`; form `--form-label-w` (105px), `--form-row-h` (32px), `--form-row-gap`, `--form-group-gap`; type `--text-ui` (13), `--text-meta` (12), `--text-doc/body/title/page/h1/display`; AI `--orb-*`; accent `--accent`, `--accent-rgb`, `--accent-gradient`, `--accent-contrast`. **No new token names.** A missing token is an S1 request.
- Scope: everything under `.needt-v3`. Theme = `data-theme="light|dark"` + `data-drift="on"` (Time) on the scope element. Accent = `data-accent`. The settings model is System/Light/Dark/Time and 6 solid + 3 gradient accents. `dim`/`paper`/`warm` selectors stay mapped but are not offered.
- Prototype CSS is vendored, not rewritten: `$P/app.css`, `themes.css`, `composer.css`, `exposure-wordmark.css` and `$P/styles/*.css` → `src/styles/v3/<file>.css`, rescoped by the sync script. Class names are kept (`hd-`, `c2-`, `wk-`, `pk-` …). JS identifiers drop the prototype prefixes. Tailwind is for layout glue only, using v3 tokens via `var()`.
- The stream that owns a screen owns its CSS file (§2.5). `app.css` / `base.css` / `shell.css` are S1/S2 only.

### 2.2 Components (`src/components/needt3/`)
- `<Task task layout="row|card|block" onToggle onOpen draggable dense? />`: one component, three layouts. Source: `$P/task.jsx` (`TkRow` 205, `TkCard` 293, `TkBlock` 353, `Task` 403; `TaskCheck` 117; `TkPartRing` 188), plus the Home row `HdTask` (`$P/HomeToday.jsx:65`). **Its prop type is `V3Task` from `src/lib/needt3/map.ts`** (what `hooks/tasks.ts` returns; decided 2026-10-10). `NeedtTask` is the old v2 model and is not used by v3. Parts and waits: `V3Task.parts` / `V3Task.waits` come with the parts/waits API (owned by lane B as card T06b); until then `<Task>` renders without the part ring and wait chip, and never fakes part writes. Completing a task = `useToggleTask` (sets status `completed`); a task with open parts can still be completed.
- `<Sheet open onClose side="right|bottom|center" from?: DOMRect>`, `<Menu>` / `<RichMenu items>` (`$P/popovers.jsx` `RichMenu` 161, `RichRow` 124, `SmallRow` 149), `<CtxLayer>` (`$P/ctx.jsx:116`) are built on Radix (`dropdown-menu`, `popover`, `dialog` already in `src/components/ui`) and styled with v3 classes. `useExit(open, ms)` is ported from `$P/motion.js`.
- `<StScreen query={…} kind="list|grid|doc|calendar">`: every screen body mounts inside it (§T08).
- **Portals stay inside the scope.** Every v3 stylesheet selector starts with `.needt-v3`, so a Radix portal into `document.body` renders unstyled. Pass `container={useV3PortalContainer()}` (an element inside `<V3Root>`) to every Radix `Portal` (Dialog, Popover, DropdownMenu, Tooltip, ContextMenu).
- Toasts: only `notify` from `src/lib/notifications.ts` (CLAUDE.md). Undo = `notify.success(msg, { action: { label: "Undo", onClick } })`. Port no `ToastLayer`.

- **Shell mount:** `V3Root` renders `children` directly. Lane A (T05) adds the one-line mount of `V3Shell` inside `V3Root.tsx` in its T05 PR — S1 grants that edit. Search: `useSearch(query)` in `src/lib/needt3/hooks/search.ts` (`/api/search`, v3 links: project → `/projects/[id]`, task → `/tasks?task=<id>`).
- **Motion corrections** go in the hand-written `src/styles/v3-overrides/motion.css` (loaded after the vendored CSS), never in `src/styles/v3/` (generated). Lanes may add a rule there for their own selectors.
- **Offline queue:** `NEEDT_OFFLINE_STATE` messages carry `scopeKey`; `null` means every scope (sign-out reset). Ignore a message whose `scopeKey` is neither `null` nor the tab's own.

### 2.3 Data and query keys
- One file, `src/lib/needt3/query-keys.ts` (S1, hour 1):
  `qk.tasks(filter?)`, `qk.task(id)`, `qk.projects()`, `qk.project(id)`, `qk.events(range)`, `qk.docs(sort?)`, `qk.doc(id)`, `qk.templates()`, `qk.shared()`, `qk.trash()`, `qk.habits()`, `qk.checkins(range)`, `qk.mail(folder)`, `qk.thread(id)`, `qk.boards()`, `qk.board(id)`, `qk.connections()`, `qk.settings()`, `qk.plan()`, `qk.shell()`.
  Every key is prefixed `["v3", …]`, so v3 never shares cache entries with old screens.
- Hooks in `src/lib/needt3/hooks/<entity>.ts` call the **existing** routes (`/api/tasks`, `/api/projects`, `/api/events`, `/api/pages`, `/api/page-templates`, `/api/habits`, `/api/mail`, `/api/moodboards`, `/api/integrations/*`, `/api/settings`, `/api/billing`, `/api/needt/*`). Mutations are optimistic and return an `undo()`. A field without a column follows the three-state convention in `types.ts` (`null` = not built yet).
- Client UI state uses Zustand: one store, `src/store/needt3-ui.ts` (sidebar open, settings sheet + section, palette, composer, ask dock, focus). Domain data never goes into Zustand.

### 2.4 Route map (flag on)

| Old route → component | New |
| --- | --- |
| `/` → redirect `/calendar` | redirect `/today` |
| `/today` → `needt/home/TodayRoute` | Home (`HomeToday`) |
| `/tasks` → `needt/workspace/WorkspaceRoute` | Tasks (`work.jsx` mode tasks) |
| `/projects` → `WorkspaceRoute` | Projects; new `/projects/[id]` (`WkProjectPage`) |
| `/calendar` → `needt/calendar/CalendarRoute` | `CalendarCraft` |
| `/pages` → `needt/docs/DocsRoute` | Docs grid. URL stays `/pages`; renaming it would break public links and the API |
| `/pages/[id]` → `pages/PageWorkspace` | Document chrome around the **existing** editor |
| `/mail` → `mail/MailPage` | Mailbox |
| `/moodboards`, `/moodboards/[id]` → `moodboards/*` | Moodboards |
| — | `/habits`, `/templates`, `/shared`, `/trash`, `/connections` (new) |
| `/settings` → `needt/settings/SettingsRoute` | Settings **sheet**. `/settings#section` deep-links open the sheet over `/today` |
| `/chat` → `ai/AIChatSurface` | unchanged; Ask Needt is a dock (⌘J, with ⌘/ kept as an alias) |
| `/focus` → `focus/FocusMode` | unchanged (cut list); the Focus window opens from the sidebar |
| `/auth/signin`, `/setup` | `AuthScreen`, `OnboardingScreen` |
| `/boards*` | already redirects to `/pages` |

### 2.5 File ownership

| Stream | Owns (write) |
| --- | --- |
| S1 Foundation (Claude) | `prisma/**`, `scripts/sync-design-tokens.mjs`, `scripts/check-design-tokens.mjs`, `src/styles/v3/{ds-*,themes,base,app,exposure-wordmark,home,auth,paywall,scenes}.css`, `src/lib/feature-flags*.ts`, `src/lib/needt3/**`, `src/store/needt3-ui.ts`, `src/app/(app)/layout.tsx`, `src/app/page.tsx`, `needt3/{home,auth,paywall,scenes,wordmark,corner,cursor,orb}/**`, `CHANGELOG.md` |
| S2 Shell (Codex A) | `needt3/{shell,palette,ctx,menu,dialogs/TaskDialog*,work,places}/**`, `src/styles/v3/{shell,tasks,places}.css`, routes `/tasks`, `/projects*`, `/moodboards*`, `/templates`, `/shared`, `/trash` |
| S3 Objects (Codex B) | `needt3/{task,composer,drag,calendar,settings,connections}/**`, `src/styles/v3/{composer,calendar,settings,connections}.css`, routes `/calendar`, `/settings`, `/connections` |
| S4 Layers (Codex C) | `needt3/{states,docs,document,focus,mail,habits}/**`, `src/styles/v3/{docs,focus,mail,habits}.css`, routes `/pages*`, `/mail`, `/habits` (`chat.css` and the corner/cursor/orb moved to Claude) |

Each stream also writes its own route `page.tsx` files. Nobody edits the old `src/components/needt/**`, `src/components/layout/AppShell.tsx`, `src/app/globals.css`, or the old `src/styles/needt-*.css`.

## 3. Rules every subagent follows (paste into every prompt)

1. Greys = one text colour at a ladder alpha: text 100/85/70/55/40/25, fills 2/3/4/6/8/12. No new greys.
2. Chrome type is 13 / 12 px. No 14 px. 16 px is document body only.
3. Accent is never a solid fill on a button or surface; it appears only on marks (switch knob, radio centre, status dot, now-line, progress).
4. One form row: `--form-label-w: 105px`, rows 32 px. Shorten a label that does not fit; never widen the column.
5. Elevation is ring-first. Dark themes use the one `--shadow-raised*` bevel override in `themes.css`. Do not add a shadow to make a card "pop".
6. Canvas is the ground, objects are white (`--surface-raised`), colour is a mark. No sheet under a whole screen (that makes every object on it a card on a card). Events keep a 13–16 % wash.
7. Info text ≥ `--text-tertiary`. Quaternary/muted is for decoration, done items and placeholders only. Fix the part counter "1/2" (`HdTask`) to `--text-tertiary`.
8. One fact, one home: prices come from one `NEEDT_PRICING` module (Pro $7 / $59, Lifetime $149 / cap 300, trial 14 days). "N of 300 left" comes from the server (`LifetimeHold`), never the prototype's `212`. Dates come from `@/lib/date-utils`.
9. Owner-locked (old PORT §0/§6, CLAUDE.md), do not "improve":
   - The agent cursor uses minimum-jerk `10t³−15t⁴+6t⁵`, duration `clamp(210+190·log2(d/90+1),300,760)`, one quadratic bezier fixed before frame 1, `translate3d` written to the element, and it emerges from and returns to the corner.
   - The island grows out of the pill. It is not a toast.
   - A count appears only when rows are hidden.
   - One `ResizeObserver` on the container, never one per card.
10. Performance (PORT §5): one rAF per pointer stream. No `getBoundingClientRect()` in `pointermove` (cache it, invalidate on scroll and resize). "Where we are" is read from a ref.
11. Motion (MOTION.md): use durations from the scale 90·120·130·140·150·170·180·220·240·250·260·280 and curves `ease-pop` / `nx-ease` / `chat-out`. While porting, apply these fixes:
    - **Nothing loops at rest.** Only spinners, skeletons and the orb/caret/shimmer while AI works may loop. Drop V-A6/7 (mount-time tick/ring, chip land on mount: play on change only).
    - **Entry fill is `backwards`, never `both`**: `.screen-enter`, `.nx-swap`, `.sb-tile`, `.tk-block`, `.settings-enter`, `.auth-enter`, `.sb-swap`, `.mbm-tile` (V-B8).
    - **Reduced motion everywhere.** Port the global rule `$P/styles/base.css:116-133` and use `animation:none` for shimmer. In JS, check `matchMedia('(prefers-reduced-motion: reduce)')` for the cursor, drag, wordmark, orb and springs. `useExit` unmounts at once under reduced motion, and the Home check timers skip.
    - Off-scale values (V-D17) snap to the nearest scale step **except** values owned by an owner decision (cursor, wordmark 5.2 s, sky).
    - Overshoot curves above 1 are removed, except the drag settle (`1.25`) and the switch knob.
    - Dead keyframes (V-D20) are not ported.
    - Exit times match `useExit` (V-D18).
12. **Phone perf fix** (nav-a menu, `PkSheet from=`, composer from the pill):
    - Animate `transform`, `opacity` and `clip-path` only. Never animate `width`, `height`, `border-radius`, `top` or `left`. Radius morphs become `clip-path: inset(… round r)`.
    - No `filter: drop-shadow()` on an element that resizes or moves. Use a static shadow layer, faded by opacity.
    - **One `backdrop-filter`** per screen stack (the band/glass under the menu). Never stack blur on blur, and never put blur under an ancestor with opacity, filter, mask or clip-path (PORT §3a).
    - Springs write `transform` via ref per frame, never through React state.
13. Repo: Prisma via `@/lib/prisma`; `logger` with `LOG_SOURCE` (no `console.log`); Next 15 `params` is a Promise; icons via `react-icons` (map the lucide names); JSX text escapes `&apos;` / `&quot;`; do not remove `//todo`. Each stream records its CHANGELOG lines in its handoff (S1 merges them). No `new Date()` outside date-utils.
14. Port only what `$P/index-dev.html` / `mobile-dev.html` mount. Do not port: `$P/SCREENS.md` "Do not port" (`CalendarScreen.jsx`, `ColumnsView` views, `Brief.jsx`, `BlockDesigns.jsx`, `RichBlock.jsx`, `TaskRow.jsx`, `Flame.jsx`, labs, `_archive`, `_orig`). The helpers `cvProject` / `cvDur` move to `src/lib/needt3/`.
15. Gates before every hourly merge: `npm run type-check`, `npm run lint`, `npx jest <touched>`, `npm run tokens:check`. A screenshot pair (prototype vs app, light + dark, 1440×900) goes in the handoff.

## 4. Day 1 — desktop

Every task card: **Src → Target → Deps → Accept.**

### Hour 1 (0:00–1:00) — foundations, all four in parallel

**T01 Tokens, themes, fonts (S1)**
- Src: `docs/port/_ds/{styles.css,tokens/*.css}`, `$P/themes.css` (1437), `$P/app.css` (1159), `$P/composer.css`, `$P/exposure-wordmark.css`, `$P/styles/*.css`, `$P/Drift.jsx` (Time theme), `$P/settings-kit.jsx` (theme/accent lists).
- Target:
  - `scripts/sync-design-tokens.mjs` gains `--scope .needt-v3 --out src/styles/v3` and the bundle path `"Needt - Design : App, Landing"`. Output: `src/styles/v3/*.css`.
  - `scripts/check-design-tokens.mjs` checks the v3 files.
  - Fonts: `next/font/local` for Exposure from the licensed `public/fonts/ExposureVAR.woff2`. Newsreader and Nunito come via `next/font/google`.
  - `src/lib/needt3/theme.ts` holds System/Light/Dark/Time + accents.
- Deps: none.
- Accept: `npm run tokens:check` passes; `/style` (old) is pixel-identical (`npx playwright test --config=playwright.visual.config.ts style-lab`); a scratch page under `.needt-v3` shows text ladder and fills matching `$P/index.html` in both themes.

**T02 Flag + v3 frame (S1)**
- Target:
  - `src/lib/feature-flags-keys.ts` (`DESIGN_V3 = "design_v3"`, client-safe).
  - `src/lib/needt3/design-flag.ts`: `isDesignV3 = cache(async () => …)`.
  - `src/app/(app)/layout.tsx` renders `<V3Root>` (scope element, theme attrs, providers, `needt3-ui` store, QueryClient) instead of `AppShell` when the flag is on.
  - Migration `…_design_v3_flag` inserts the `FeatureFlag` row (disabled, 0 %).
  - `scripts/reset-e2e-environment.ts` adds an override for the visual user when `NEEDT_DESIGN=v3`.
- Deps: none.
- Accept: flag off → `npm run test:visual -- app-surfaces` is unchanged; flag on (override) → `/today` renders an empty v3 frame with no console errors; jest test for `isDesignV3` (override wins, rollout bucket).

**T03 Migrations (S1)**
- Src: `$P/PORT.md` §2 "New fields", `$P/Data.js` `NEEDT.schema`.
- Target: one additive migration:
  - `Page.style Json?`
  - `Project.ground String?`
  - `Habit.color String?`, `Habit.icon String?`
  - `MailMessage.taskId String?`, `MailMessage.needsReply Boolean @default(false)`, `MailMessage.trashedAt DateTime?`
  - `Moodboard.trashedAt DateTime?`
  - `Task.trashedAt DateTime?`
  - `UserSettings.accent String?` and `UserSettings.ui Json?` (sidebar tiles, sorts, `calHideDone`)

  Mappings with no column change: `isFixed↔scheduleLocked`, `movedFrom↔previousScheduledStart`, `value↔valueCents`, `Stage↔globalStage`. `src/lib/needt3/map.ts` holds them. The API accepts the new fields (zod) in `/api/pages`, `/api/projects`, `/api/habits`, `/api/mail`, `/api/moodboards`, `/api/tasks`.
- Deps: none.
- Accept: `npx prisma migrate dev` is clean; `npm run prisma:generate`; `schema-drift` CI job is green; jest round-trip for each mapping.

**T04 Data hooks + query keys (S1)**
- Target: `src/lib/needt3/query-keys.ts` and `hooks/{tasks,projects,events,docs,habits,mail,boards,connections,settings,plan}.ts` per §2.3; `cvProject` / `cvDur` / `NEEDT.*` helpers (`$P/Data.js` 1–917: `dueLabel`, `timeLabel`, `moveDay`, `placeAt`, `habitStreak`, `habitWeek`, `eventBlock`, `mailDayLabel`) → `src/lib/needt3/derive.ts`.
- Deps: T03 (types).
- Accept: jest on `derive.ts` (port the prototype's fixed week 31 Aug–6 Sep as fixtures).

**T05 Shell (S2)**
- Src:
  - `$P/Sidebar.jsx` (835: `Sidebar` 650–816, `PlaceTile` 462, `SbRow` 533, `MiniMonth` 92, `FocusControl` 310, `AccountMenu` 210, `SbPinPop` 551)
  - `$P/sidebar-kit.jsx` (`SidebarToggle` 68, `CustomizeSidebar` 153, `SidebarSwitcher` 199)
  - `$P/topbar.jsx` (`TopIcons` 198, `NotesPanel` 84, `WhatsNew` 164)
  - `$P/search.jsx` (⌘K, 232)
  - `$P/ctx.jsx`, `$P/popovers.jsx`
  - `$P/App.jsx` 1–135 (`KeySheet`, `NEEDT_KEYS`, `GO`) and 135–725 (layout, rail, `useDrag` host)
  - `$P/styles/shell.css`; `SCREENS.md` "Shell (desktop)" 142–260.
- Target: `needt3/shell/{V3Shell,Sidebar,Topbar,KeySheet,keys.ts}.tsx`, `needt3/palette/CommandPalette.tsx`, `needt3/ctx/*`, `needt3/menu/RichMenu.tsx`. Places list = route map §2.4. Search hits `/api/search`.
- Deps: T01, T02.
- Accept: sidebar + topbar + ⌘K + `?` sheet at 1440 and 768 (collapsed) match `$P/index.html` light/dark; jest `keys.test.ts` (sheet rows == handler table; `G T` and `G P` present).

**T06 `<Task>` (S3)**
- Src: `$P/task.jsx` (413, all of it), `$P/HomeToday.jsx` 24–90 (`HdProjChip`, `HdSourceChip`, `HdTask`, `HdCapped`), `$P/styles/tasks.css`, `$P/PORT.md` §2 Task.
- Target: `needt3/task/{Task,TaskCheck,PartRing,chips}.tsx` per §2.2.
- Deps: T01, T04 types.
- Accept: a `/style`-like fixture page with row/card/block × {plain, parts, waiting, overdue, fixed, done, long title, no project} matches `$P/blocks.html`-equivalent rows in `index.html`; jest on derived labels.

**T06b Parts and waits API (S3, lane B, delegated from S1)**
- Target: `GET /api/tasks` and `GET /api/tasks/[id]` include `parts` (ordered by `position`) and open `waits` (`resolvedAt: null`, with the waited-on user's id/name/image). New routes: `POST /api/tasks/[id]/parts`, `PATCH|DELETE /api/tasks/[id]/parts/[partId]`, `POST /api/tasks/[id]/waits`, `PATCH /api/tasks/[id]/waits/[waitId]` (resolve). Same auth/workspace scope as `/api/tasks/[id]`. `map.ts` adds `parts: {id,title,done}[]` and `waits: {id,on,onName,for}[]` to `V3Task`; `hooks/tasks.ts` adds `useTaskParts`/`useTaskWaits` mutations with undo.
- Deps: T04. Accept: jest for the mapping and route auth (another workspace's task → 404); type-check; lint.

**T07 Composer (S3)**
- Src: `$P/Composer.jsx` (490: `Composer` 267, `CoShelf` 207, `CoChip` 141, `CoMenu2` 177, `CoDrafts` 236), `$P/composer.css`; parser: existing `src/components/needt/composer/co-parse.ts` (reuse, extend). `SCREENS.md` 251–260.
- Target: `needt3/composer/Composer.tsx`, opened by `N` / Create → New task, creating through `useCreateTask`.
- Deps: T06, T04.
- Accept: "call Anna tomorrow 3pm 30m #ops !high" → chips → task created → Undo works; `co-parse.test.ts` green.

**T08 States layer (S4)**
- Src: `$P/states.jsx` (624: `StBanner` 258, `StBannerStack` 302, `StSkeleton` 313–378, `StError` 379, `StNoAccess` 397, `StScreenLayer` 423, `StSettingsLayer` 436, `StOfflineIndicator` 463, `StLocks` 512; skip `StSwitcher`, the dev tool), `SCREENS.md` 331–340.
- Target: `needt3/states/*`. `<StScreen query kind>` maps TanStack status: loading → skeleton, error → `StError` + retry, 403 → `StNoAccess`, offline → `src/lib/pwa/offline-client.ts` + queued count. Banners: account (trial ending/ended, payment failed from `qk.plan()`), AI limit/down. Plus empty-state primitive `PlEmpty` (`$P/places.jsx:60`).
- Deps: T01, T02.
- Accept: each `kind` skeleton + error + offline banner screenshot vs `$P/index.html` with `⌥S` switcher states; jest for status→state mapping.

### Hours 2–4 (1:00–4:00) — main screens

**T09 Home (S1)**
- Src: `$P/HomeToday.jsx` 90–816 (`HdFold`, `HdNextUp` 189, `HdProgressCard`, `HdStreakCard`, `HdHabitsCard`, `HdPlanButton` 253, `HdEmptyDay` 266, `HdDayClosed` 282, `HdSchedule` 313, `HdInboxCard` 379, `HdWeekStats` 410, `HdWeekLoad` 452, `HomeToday` 511), `$P/TodayScreen.jsx` (wrapper only), `$P/Habits.jsx` `HabitToday` 173 (chips), `$P/styles/home.css`, `SCREENS.md` 343–362.
- Target: `needt3/home/*`, `src/app/(app)/today/page.tsx` branch.
- Deps: T06, T08, T04 (`/api/needt/today` reused).
- Accept: `/today` light/dark 1440 + 768 vs `$P/index.html#screen/today`; empty day + day closed states; check → strike → Undo.

**T10 Tasks + T11 Projects + task dialog (S2)**
- Src: `$P/work.jsx` (544: `WorkScreen` 262, `WkProjectPage` 164–247, `ProjectCard` 85, `NewProjectSheet` 39, `WkEmpty` 248), `$P/Dialogs.jsx` `TaskDialog` 156–757, `$P/stores.jsx` `useProjects` 478–618, `SCREENS.md` 260–289, 363–388.
- Target: `needt3/work/*`, `needt3/dialogs/TaskDialog.tsx`, routes `/tasks`, `/projects`, `/projects/[id]`.
- Deps: T05, T06, T08.
- Accept: Inbox/Today/Upcoming/All filters; project create/rename/recolor with Undo; the dialog edits every §2 field and persists after reload; screenshots vs `#screen/tasks`, `#screen/projects`.

**T12 Calendar + drag (S3)**
- Src: `$P/calendar2.jsx` (733: data 1–206, `C2Block` 235, `C2Peek` 259, `C2MoreChip` 311, `C2SlotList` 328, `C2SlotPop` 349, `WeekView` 383–485, `DaysView` 535–622, `CalendarCraft` 623), `$P/Drag.jsx` (438), `$P/styles/calendar.css`, `SCREENS.md` 389–407. Density cap: ≤ 3 side by side, then "+N".
- Target: `needt3/calendar/*`, `needt3/drag/*` (reuse geometry from `needt/interaction/drag/geometry.ts`), route `/calendar`.
- Deps: T06, T08, T04 `qk.events`.
- Accept: Week + 3-day + Agenda vs `#screen/calendar`; drag a task to 10:15 (15-min snap) → `scheduledStart` + `scheduleLocked` saved, Undo; the drag perf rules hold (Performance panel: no layout in `pointermove`); jest geometry.

**T13 Docs grid + T14 Document (S4)**
- Src:
  - `$P/DocsScreen.jsx` grid 1–551 (`DocCard` 344, `DocList` 415, `DocsScreen` 476)
  - document 552–2020 (`DocPanel` 705, `DocShareSheet` 846, `DocTopRight` 1032, `FormatPanel` 1125, `InfoPanel` 1198, `DocComments` 1306, `SelectionBar` 1355, `DocSlashMenu` 1617, `DocumentScreen` 1675)
  - `DcStylePanel` 184–331
  - `$P/doc-style.jsx` (680), `$P/docs-kit.jsx` (144), `$P/styles/docs.css`; `PORT.md` §3b (spans, `fmt`); `SCREENS.md` 408–450.
- Target: `needt3/docs/*`, `needt3/document/*`, routes `/pages`, `/pages/[id]`. **The editor stays `PageWorkspace` (collaboration, revisions, `editor_v2`).** Port only chrome: cover, style panel (`Page.style`), top-right, panels (outline, find, files), share sheet over `PageAccessGrant`, and the selection-bar actions mapped to existing block marks. Span rendering for read-only cards (`MiniBlock`).
- Deps: T05, T08, T03 (`Page.style`).
- Accept: grid sort/pin/trash with Undo; open doc → edit → reload keeps text; style + cover persist; `tests/pages.spec.ts` green with the flag on.

### Hours 5–7 (4:00–7:00) — secondary places and layers

**T15 Mailbox + T16 Habits (S1)**
- Src:
  - `$P/MailScreen.jsx` (522: `MlRow` 75, `MlComposer` 196–331, `MlConnBanner` 45, `MailScreen` 348), `$P/styles/mail.css`
  - `$P/places.jsx` `HabitsScreen` 181–227, `PlHabitSheet` 84, `PlHabitMenu` 164, `PL_QUOTAS` 80, `$P/Habits.jsx` (388), `$P/styles/habits.css`
  - `SCREENS.md` 451–474, 506–521.
- Target: `needt3/mail/*`, `needt3/habits/*`, routes `/mail`, `/habits`.
- Deps: T06, T08, T03.
- Accept: thread → Make a task (`MailMessage.taskId`); archive / trash with Undo; habit check-in today, the 14-day strip and streak computed from `HabitCompletion`; free-plan habit quota gate.

**T17 Moodboards + T18 Templates + T19 Shared + T20 Trash (S2)**
- Src: `$P/places.jsx` `MoodboardsScreen` 438–1512, `TemplatesScreen` 228–311, `TrashScreen` 312–394, `SharedScreen` 395–437, `PlaceHeader` 6, `PlSceneHeader` 19 (sky header ← `$P/scenes.jsx` `PxSky` 1466, `GlassCard` 1499, `PxBadge`, `PxDots`, engine 1–1465), `$P/styles/places.css`, `scenes.css`; `SCREENS.md` 475–544.
- Target: `needt3/places/*`, `needt3/scenes/PxSky.tsx` (S1 owns `scenes/`; S2 takes it on loan only in hour 5, noted in both handoffs). Routes as §2.4.
- Deps: T05, T08, T03.
- Accept:
  - Sky: 20/24 fps in use, stops after 12 s idle (Performance: no frames), paused off-screen, one still frame under reduced motion.
  - Trash lists pages, tasks and boards, with restore.
  - Templates create a page via `/api/page-templates`.

**T21 Settings + T22 Connections (S3)**
- Src:
  - `$P/SettingsScreen.jsx` (647: `SGroup` 64, `SRow` 77, `ThemeTile` 139, `AccentCard` 167, `SettingsScreen` 234), `$P/Miniature.jsx`, `$P/Drift.jsx`, `$P/states.jsx` `StSettingsLayer`, `$P/stores.jsx` `SETTINGS_DEFAULTS` 153
  - `$P/connections.jsx` (1066: `CnCard` 737, `CnSheet` 214, `CnConsent` 232, `CnCalSync` 421, `CnLinkSheet` 521, `CnAiPromo` 709, `ConnectionsScreen` 791), `$P/connections-data.js`, `$P/brand-icons.js`
  - `SCREENS.md` 545–613.
- Target: `needt3/settings/*` (a sheet over the route, opened from the store; `/settings#x` deep link), `needt3/connections/*`, route `/connections`. Wire existing `src/components/settings/*` logic (billing, notifications, schedules, AI, account deletion) behind the new rows. Do not rewrite it.
- Deps: T05, T01 (theme), T08.
- Accept:
  - Theme switch System/Light/Dark/Time and accent persist (`UserSettings`).
  - Every form row holds 105 / 32.
  - Google connect starts the real OAuth via `/api/integrations/connect`.
  - `tests/settings.spec.ts` passes with the flag on.

**T23 Ask Needt corner + T24 notifications island + T25 agent cursor (S4)**
- Src:
  - `$P/Chat.jsx` (1562: island/quiet 90–123, reply engine 492–629, cards 630–871, `Chat` 886–1562), `$P/AiOrb.jsx`, `$P/Notifications.jsx`, `$P/AgentCursor.jsx`, `$P/styles/chat.css`
  - `SCREENS.md` 290–314; old PORT §5 "corner" + "agent cursor".
  - Existing ports to reuse: `needt/corner/stack.ts`, `needt/cursor/motion.ts` (tests exist).
- Target: `needt3/corner/*`, `needt3/orb/AiOrb.tsx`, `needt3/cursor/*`. Replies come from the existing `/api/ai` stream (not `chatReply` scripts). Notifications come through the `notify` facade bridge.
- Deps: T05, T08.
- Accept:
  - pill 116×40 → island 376×54 → panel 392×496 is one element;
  - ⌘J works;
  - the orb is still at rest (`document.getAnimations()` empty after 3 s idle);
  - the cursor flight matches `motion.test.ts`;
  - stack ≤ 4, and hover pauses dismiss.

### Hour 8 (7:00–8:00)

**T26 Auth / onboarding + T27 paywall (S1 + S2)**
- Src:
  - `$P/AuthScreen.jsx` (1000: `AuthScreen` 146–483, `OnboardingScreen` 818, `ObSidebarGame` 702), `$P/ExposureWordmark.jsx`, `$P/app-icon/*`
  - `$P/paywall.jsx` (373: `NEEDT_PRICING` 29, `ProBadge` 270, `ProGate` 286, `ProUpsell` 302, `ProLimit` 327, `PwPromoCard` 341), `$P/paywall-sheet.jsx` (346: `Paywall` 253, `PwHost` 333)
  - `$P/styles/auth.css`, `paywall.css`; `SCREENS.md` 614–674.
- Target:
  - `needt3/auth/*` (routes `/auth/signin`, `/setup`), `needt3/paywall/*`.
  - Checkout = `/api/billing/checkout`, which stays disabled while the Creem review is blocked: the CTA says so.
  - Gating reads `src/lib/entitlements.ts`.
- Deps: T01, T17 (sky).
- Accept: `tests/onboarding.spec.ts`, `trial.spec.ts`, `entitlements.spec.ts` pass with the flag on; prices are rendered from one module.

**T28 Integration (S3 + S4)**
- Merge order S1→S2→S3→S4 into `feat/design-v3`.
- Run every gate from `docs/STACK.md`: type-check, lint, unit, e2e (flag off **and** on via `NEEDT_DESIGN=v3`), build, build:worker, `tokens:check`, `check:ui-contracts`, `check:branding`.
- Add `tests/visual/v3-desktop.spec.ts` (all 14 routes × light/dark × 1440/768, with the override) **without baselines yet**.
- Merge CHANGELOG lines.
- Owner override on staging.

## 5. Days 2–3 — phone

**Contract:** one tree. The server picks the phone UI from the UA (`Sec-CH-UA-Mobile`, iOS/Android) or the `needt-ui` cookie, under the flag. A resize across 700 px swaps only the shell layer, never the route children (choosing in JS after hydration remounted pages; see `AppShell.tsx` comment). Data, query keys and `<Task>` logic are shared. The phone kit is new UI.

| Day/hours | S1 | S2 | S3 | S4 |
| --- | --- | --- | --- | --- |
| D2 0–3 | **P1 Kit**: `$P/phone-kit.jsx` (1489: `PkScreen` 852, `PkSheet` 1161–1420, `PkPullDown` 944, `PkRow` 594, `PkTaskRow` 705, `PkHold` 1421, `PkActions` 1458, `PkSkyPlate` 429; `pkDay` → `src/lib/needt3/day.ts`), `styles/phone-kit.css` → `needt3/phone/kit/*` | **P2 Menu A + shell**: `$P/nav-a.jsx` (`NeedtNavA` 308–772, `NvaSettings` 240), `mobile-nav.jsx`, `mobile-v2-plates.jsx` `V2pLivePhone` 518, `V2pScreens` 434; places registry → route map; **apply the perf fix** | **P3 Overlays**: `$P/phone-overlays.jsx` (`PkTaskSheet` 68, `PkComposer` 198 from the pill, `PkAsk` 280, `PkSnack`→`notify`, `PkPaywall` 352, `PkEventSheet` 376), `phone-drag.jsx` | **P4 States + auth**: phone states glyphs (`Mobile.jsx` `MbStGlyph` 656), `MobileAuth.jsx` (`MbAuth` 133, `MbSetup` 626) |
| D2 3–7 | **P5 Home + Calendar**: `mobile-v2-plates.jsx` `V2pHome` 70, `V2pCalendar` 273, `V2pWeek`/`V2pMonth` | **P6 Tasks + Projects**: `phone-tasks.jsx` (467) | **P7 Docs + reader**: `phone-docs.jsx` (`PdDocs` 1588, `PdDocReader` 785–1560, `PdPageStyleSheet` 458), `Mobile.jsx` `MbDoc*` 219–538 | **P8 Mailbox**: `phone-mail.jsx` (496) |
| D3 0–4 | **P9 Habits + Moodboards**: `phone-habits.jsx` (`PhbHabits` 330, `PhbBoards` 955, `PhbWall` 511), `Mobile.jsx` `Mbm*` 539–655 | **P10 Places**: `phone-places.jsx` (`PplConnections` 269, `PplTemplates` 541, `PplShared` 602, `PplTrash` 676) | **P11 Settings**: `phone-settings.jsx` (`PsSettings` 722, pages 244–706) | **P12 perf + motion audit** on all phone screens (rule 12, MOTION V-A6, V-C15) |
| D3 4–8 | integration + e2e phone (`tests/mobile-navigation.spec.ts`, `pages-mobile.spec.ts` with the flag on) | `v3-phone.spec.ts` | fixes | baselines (§6) |

**Phone acceptance (every P task):**
- 390×844, light/dark, vs `$P/mobile.html`.
- `document.getAnimations()` is empty after 3 s idle.
- The menu open/close trace in the Chrome Performance panel shows no Layout/Paint per frame (composite only) and ≥ 55 fps on 4× CPU throttle.
- Exactly one element has a computed `backdrop-filter` while the menu moves.

## 6. Visual baselines

**Nothing breaks during the port**, provided the rules hold: the flag defaults off, the visual user gets no override, and `AppShell.tsx`, `globals.css`, `src/styles/needt-*.css` and old `needt/**` are not touched. Verify after T01/T02 with the existing suite.

What breaks when the flag is on for the visual user (at the flip):
- **Screenshot specs.** All are linux PNG baselines: `app-surfaces` (89 files: calendar, today, workspace, palette, settings-appearance, page-document), `settings-tabs` (87), `secondary-surfaces` (48: chat, focus, mail-list/message, pages), `task-editor` (34), `style-lab` (30, unaffected; `/style` is old), `design-completion-states` (22), `boards-workspace` (21), `theme-modes` (18), `today-agenda` (12).
- **DOM-assertion specs** whose selectors die: `calendar-production`, `focus-session`, `notifications`, `pages-block-editor`, `pages-database`, `schedules-flexible-hours`, `shell-controls`, `sign-in`, `today-agenda`.

**Plan: regenerate once, at the end of day 3:**
1. Day 1–3: new specs `tests/visual/v3-desktop.spec.ts` and `v3-phone.spec.ts` set the override in `beforeAll` and run locally with `--update-snapshots` for review only. Do not commit darwin PNGs as linux baselines.
2. When the port is accepted: merge `origin/main` into `feat/design-v3` (the job rejects a ref behind main). Then run:
   ```bash
   gh workflow run ci.yml --ref feat/design-v3 -f target_branch=codex/design-v3-baselines-2026-10-12
   ```
   The target must be `codex/*` and must not already exist on the remote. A failing assertion stops the run, so fix selectors first.
3. The job creates `codex/design-v3-baselines-…` from main carrying only the `*-linux.png` files. Merge it into `feat/design-v3`.
4. Old specs and their PNGs are deleted in the **contract step** (after the flag reaches 100 %), together with old `needt/**`, `.needt-v2`, `AppShell.tsx`'s old branch, and the shadcn token block. That is a separate PR.

## 7. Risks and what to cut

- **Before `port/integration` goes to `main`:** `V3Root` imports `src/styles/v3/index.css` statically, so ~1 MB of v3 CSS (all scoped, no visual effect) loads for flag-off users too. Load it only when the flag is on (separate route-group layout or a `<link>` emitted by `V3Root`) before merging to main.


**Top risks**

1. **Document editor mismatch.** The prototype's `[kind,text,extra,fmt]` + spans model ≠ `PageBlock` + collaboration. Porting `DocumentScreen` literally would fork the editor. Mitigation: chrome-only (T14). Mentions, comments and make-task go through existing `PageComment` / tasks APIs, or are cut.
2. **Hour-1 contracts slip.** Everything waits on T01/T02/T04/T06. Mitigation: S1 publishes stub hooks with fixture data at 0:40; `<Task>` props are frozen at 0:30 even if its styling is unfinished.
3. **The prototype is untracked and large** (`$P` ~4 MB of JSX, single-line files of 90–125 KB). Agents can blow their context or read the wrong copy (`_orig/`, `_archive/`, `Content height and label fixes/`). Mitigation: line ranges above; "Do not port" list in every prompt.
4. **Scoped CSS collisions.** Vendored global classes (`.app`, `.screen-enter`, `button:active` scale) leak if the rescope misses one. Mitigation: `tokens:check` on v3 files; an old-UI visual run after T01.
5. **Merge to main = prod deploy.** A wrong flag default ships v3 to everyone. Mitigation: the migration inserts `enabled=false`; jest asserts the default; the owner override is set in staging only.
6. **Owner-locked rules vs MOTION scale.** The 5.2 s breath, the cursor timing and the old PORT §6 0.42 s rise-and-settle conflict with the 90–280 scale. Mitigation: owner values win; snap only unowned values; list conflicts in the handoff, do not decide them.
7. The notifications branch overlaps T24 (see §0).

**Cut order if day 1 overruns** (first cut first):
1. Import / Help / Bug sheets, the Focus window, `WhatsNew`, `NotesPanel`.
2. The Time theme (Drift) and gradient accents. Ship Light/Dark/System + 6 solid.
3. Moodboards (keep the old `/moodboards` behind the flag via a passthrough), Shared.
4. Agent cursor (the corner stays; the cursor is behind `ai.agentCursor`).
5. Onboarding redesign (keep the new sign-in only), and the paywall sheet (keep `ProBadge` / gating).
6. Document side panels (find, files) and the selection bar. Keep grid, cover and style.

Never cut: tokens/flag/migrations, the states layer, `<Task>`, and the four rules plus reduced motion.
