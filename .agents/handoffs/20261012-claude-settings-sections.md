---
id: 20261012-claude-settings-sections
owner: claude-lane-settings
branch: fix/settings-sections
status: active
updated: 2026-10-12T16:30:00Z
objective: Desktop Settings sheet matches the design_v3 prototype section by section (visual and structural only)
---

## Scope

- Governing plan/spec: docs/port/02-task-plan.md T21, docs/port/prototype/SettingsScreen.jsx + settings-kit.jsx + Miniature.jsx, SCREENS.md (Settings), CLAUDE.md design authority.
- In scope: every desktop Settings section (Account, Plan & billing, General, Appearance, Your day, Tasks, Focus, Notifications, Shortcuts, Data & privacy, About) and the rail, compared against the prototype served from docs/port (app-dev.html#screen/settings) at 1440x900, light and dark, Free / Pro / trial.
- Out of scope: Settings logic (plan badge, sign out of all devices, calendar sync, overdue rule), the phone face (phone/settings/**), Connections, places, Docs list, Mailbox header, src/components/needt/**, src/styles/v3/**.

## Completed

- Rail: lucide icons on every row (react-icons/lu), the person is a disc (`.settings-me-avatar.is-lg`, the vendored class) instead of the shell's raised square, the plan card is `PxSky` (promo scene) + `PxBadge` + `px-display px-on-sky` text on `data-px-scope`.
- Appearance: `Miniature.tsx` (Miniature.jsx kind "day") replaces the grey-bar `ThemePicture` on the desktop (the phone still imports `ThemePicture` and `usePalettes`, untouched). Each side is a nested `.needt-v3` scope with its own `data-theme` and the current accent; System = two layers cut at 50 %, Time = diagonal with sun/moon disc and "Auto". The accent card has its progress bar. The Time card's live reading (`timeNow` in derive.ts, `timeThemeAt` + `placeFromTz`, the same as V3Root) is back.
- `src/styles/v3-overrides/settings-desktop.css` (imported in v3-entry.css): the light descendant rules for the nine accents. The sync script rescoped the prototype's bare `[data-accent="x"]` to the frame element only on the light side, so the swatches inherited the frame's accent and looked alike on light (dark was right). Values are the vendored light blocks.
- kit.tsx: select chevron is the up-down chevron (prototype `chevrons-up-down`); `MeDisc`.
- Account: the profile avatar is the 88 px disc.
- About: What's new row (closes Settings, opens the shell's WhatsNew panel).
- Plan: a paid plan's line reads "$59 / year ($4.92/mo) · renews 7 Oct 2027" from `currentPeriodEnd` (`renewsText`).
- Tests: derive.test.ts (timeNow, fmtHour, renewsText), settings-rail.dom.test.ts, appearance-look.dom.test.ts, src/styles/__tests__/settings-desktop-css.test.ts. Mutating the code (dropping the System miniature, the rail icon span, one accent rule) turned them red.

## Working state

- Files: src/components/needt3/settings/{SettingsSheet,AppearanceSection,AccountSection,AboutSection,PlanSection,kit,derive}.ts(x), Miniature.tsx (new), styles/v3-overrides/settings-desktop.css (new), v3-entry.css, CHANGELOG.md, tests above, evidence under .agents/handoffs/evidence/settings-sections/.
- The harness page (src/app/style/settings) was temporary and is deleted.

## Verification

- Passed: `tsc --noEmit` (final tree), `npm run lint` (0 warnings), `CI=true TZ=UTC npm run test:unit -- --runInBand` and plain (399 suites passed, 3298 tests), `npm run tokens:check`, `npm run check:ui-contracts`, `npm run build` (artifact check passed, `.next` deleted), every v3-overrides/*.css parsed with postcss with balanced braces.
- Method: prototype served with `python3 -m http.server` from docs/port (app-dev.html#screen/settings); port rendered in a temporary, uncommitted harness page under `/style` inside the real V3Root with Playwright-stubbed `/api/*` (Free / Pro / trial), 1440x900, light and dark. Dev server (webpack) because Turbopack refuses the node_modules symlink.
- Not run: a real session against Postgres; Safari.

## Decisions and constraints

- Data-only (prototype shows data the product has no source for, not invented): Account sign-in methods / devices / edit pencils / avatar camera; Plan "Compare plans / Invoices" buttons for non-portal plans, "Start 14-day free trial", seats-left count, Troubleshooting group, "Every connection" and "Unlimited habits" Pro rows (no entitlement behind them, see paywall.test.ts); Tasks "Project activity" flame; Data Documents Markdown / Tasks CSV / Import menu / "This device"; About Version and Help centre; Your day planning options (Plan automatically, order, focus blocks, shortest block).
- Logic left to the integrator's agent: rail promo says "See plans" (the prototype "Start trial", no trial-start route) and has no button for a trial; the trial plan line and name copy; Compare plans / Switch to yearly.
- The nested theme scopes in Miniature rely on `.needt-v3:is([data-theme=…])` matching any element with the class, not only the frame.

## Blockers

- `None`

## Next action

- Review the PR into main.
