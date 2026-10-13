---
id: 20261012-claude-connections-sky
owner: claude-lane-connections-sky
branch: fix/connections-sky
status: active
updated: 2026-10-12T00:00:00Z
objective: The desktop Connections screen matches the frozen prototype (connections.jsx): printed-sky window, centred hero, glass cards, the prototype's chips
---

## Scope

- Governing plan/spec: `docs/port/prototype/connections.jsx` (`ConnectionsScreen`, `CnCard`, `CnAiPromo`, `CN_CSS`), `SCREENS.md` Connections (toolbar and counts, Free AI tab, catalogue and chips), `docs/handoff/PORT.md` §0 (four rules).
- In scope: desktop `ConnectionsScreen` markup, a new `v3-overrides/connections-desktop.css`, the chip mapping in `connections/derive.ts`, the phone's chips and sections following the same mapping (`phone/places/logic.ts`), tests.
- Out of scope: the phone face's markup, `src/styles/v3/**`, `components/needt/**`, the controller's state (unchanged), the AI tools tab content (needs the AccessLink routes), the consent / sync-settings sheets.

## Completed

- Desktop screen rebuilt on the sky: `nx-window cn-screen-box` > `PxSky variant="a" radius=14` > `scroll-inner nx-scroll cn-wrap cn-screen-abs` > `cn-page` (max 1080). Hero (`px-kicker` "Sources", `px-display cn-h1` "Connections", subtitle, status pill `cn-status`), sticky bar (`cn-sentinel` + IntersectionObserver -> `is-stuck`, vendored glass), centred tabs (`cn-tabs px-track`, count "N connected", red dot with the names, `ProBadge` locked on Free), `cn-seg` Connected / All apps, `cn-chip px-chip-btn` chips, `cn-search px-track` with a clear button and Esc, `cn-grid` of `GlassCard` cards (`cn-c`, `is-down`), `GlassCard` empty state with "Clear search" / "Show all".
- Grid: 1 column, 2 from 600 px of window, 3 from 900 px of window on a screen >= 1280 (container query on the scroller, as the prototype).
- Card menu is portalled (`useV3PortalContainer` + `useExit`, flips up near the bottom edge): a glass card is its own stacking context, so an inline menu would sit under the next row.
- Free AI tab: the prototype's glass promo with the six AI tool tiles hazy behind a lock; both buttons call `openPaywall("AI tools")` / `openPaywall()` (before: `openSettings("plan")`).
- Category chips (`derive.ts` `chipOf` / `chipsOf`, one mapping for both faces): communication -> Mail & chat; calendar -> Calendars; tasks, notes, developer, ai -> Work; files -> Files; github and gitlab (developer) -> Files (the prototype files GitHub there); figma, pinterest, canva, miro, spotify -> Creative. Creative is drawn only when a card maps to it (today none does), so no chip opens an empty list. Search also matches the chip name (the prototype haystack).
- Hero pill (`heroStatus`): "<names> needs / need reconnecting" (red), "N connected · all syncing" (grey-green; AI tab: "N connected"), "Nothing connected yet". Replaces `statusLine`.
- Phone: chips and sections use the same chip mapping (`connectionChips`, `groupConnections`: Mail & chat, Calendars, Work, Files, Creative, as phone-places.jsx `CN_CHIPS`); the sub line says "· all syncing" when nothing needs reconnecting (prototype `sub`). Nothing else on the phone changed.
- Overrides: the old flat cn-* page / tab / chip / card rules left `type.css` (replaced), `connections-desktop.css` is imported last in `v3-entry.css`. Chrome type is 13 / 12 px.
- `scenes/sky-engine.ts`: the dark/light read uses the nearest `[data-theme]` instead of any dark ancestor (a light `.needt-v3` under a dark `<html data-theme>` drew the dark sky).

## Working state

- Evidence: `.agents/handoffs/evidence/connections-sky/` (before / after, 1440 light and dark, 1 connected + Outlook needs reconnecting), from a temporary harness page mounting the real screen in `V3Root` with stubbed `/api` responses in headless Chromium (harness deleted, not committed). The PNGs are cropped to the window and palette-reduced to stay under 150 KB (the red pill and brand colours read muted; the full-size renders were compared by eye). The prototype was rendered from `docs/port/prototype/app-dev.html#screen/connections` for the side by side.

## Verification

- Passed: `tokens:check`, `check:ui-contracts`, `npm run lint` (0 warnings), `CI=true TZ=UTC npm run test:unit -- --runInBand` (397 suites, 3307 tests), every `v3-overrides/*.css` parses with postcss, `next build`. `tsc --noEmit` reports 36 errors, all in files this change does not touch (`src/services/ops/*`, `src/lib/auth/*`, `src/app/api/agent/actions`): the box's generated Prisma client is older than the schema (`agentAction`, `sessionVersion`); none in the Connections, phone Places, scenes or styles files.
- Jest: `connections/__tests__/ConnectionsScreen.dom.test.ts` (hero, attention pill, tabs + count + dot + lock, chips mapped from the real catalogue, Creative hidden, chip / Connected / search filtering, empty state, status pills, Reconnect, no Free mail cap, portalled menu, AI promo -> paywall, grid columns 3 / 2 / 1 read from the stylesheet), `derive.test.ts` (`chipOf`, `chipsOf`, `heroStatus`, filter by chip and chip name), `phone/places/__tests__/logic.test.ts`.

- Red-on-break checked: `github` mapped to Work fails 2 tests in `derive.test.ts` / the screen test; the three-column rule changed to four fails the grid test.

## Decisions and constraints

- Not drawn: the prototype's "Free: 1 mail account" pill and Upgrade on the other mail cards. `PLAN_LIMITS.FREE.mailboxes` is 0 (Pro 3), so the pill would state a rule the product does not have. A cap needs an owner decision (the phone lane asked the same question).
- Not drawn: the three benefit lines on the Free AI promo ("Your own MCP and API links" ...): MCP / API links need the AccessLink routes. Beta / Pro marks on single cards, "Synced ..." meta (no last-sync in the connections list), Sync now / Sync settings, screen memory (`needt.cnState`).
- Tab label is 13 px, not the prototype's 15 (rule 2); status pill 12 px (12.5), card name 13 (15), search 13 (13.5), kind line 12 (12.5).
- Entry animation caps the stagger at 12 cards (30 ms each), as the port did; the prototype staggers all 33.

## Blockers

- None.

## Next action

- Review the PR into main. Owner questions: (1) a Free mail cap on Connections, (2) the Free AI promo benefit lines once the AccessLink routes exist.
