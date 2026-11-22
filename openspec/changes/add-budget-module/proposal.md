## Why

Needt Budget is a separate app (budget.needt.app) with the same Needt account. The owner wants it to live inside Needt like Agents and Connections: a place in the sidebar and a screen inside the Needt shell (decision 14.11.2026).

## Approach

v1 shows Budget itself in a frame on `/budget`, signed in through Needt's own OpenID Connect provider (`needt-oidc-provider`). Budget is FastAPI with server-rendered templates; porting its screens to React would mean rewriting the app. The frame needs no change to Budget's data or money logic, and the two hosts are the same site (needt.app), so Budget's `SameSite=Lax` session cookie reaches the frame. A native port is a separate task later.

## What Changes

- New flag `budget_module` (off for everybody). Without it nothing changes: no row, `/budget` is a 404, `GET /api/budget/nav` says `{ enabled: false }`.
- A Budget row in the desktop sidebar (after Agents) and the phone menu (before Settings).
  - Free: grey with a PRO pill; it cannot be hidden; it opens a promo with no Budget data and the usual Pro buttons (hidden in store builds).
  - Pro: a normal row, hidden by a switch in Settings → General (`prefs.budgetInSidebar`).
- `/budget`:
  - Free: the promo.
  - Pro, first visit: the promo with **Open** (works at once); Budget opens on its own after 10 s. The flag `prefs.budgetPromoSeen` is stored on the account (`UserSettings.prefs`), not in localStorage.
  - Pro, later visits: Budget at once, in a frame on `${NEXT_PUBLIC_BUDGET_URL}/dashboard?embed=1&theme=<light|dark>`; later theme changes go by `postMessage({ type: "needt:theme", theme })`.
- CSP `frame-src` allows the Budget origin.
- The promo reuses the Connections AI promo card (`cn-promo*`) on the same sky; no new visual pattern.

## Needs from Needt Budget (budget-tracker, owned by the Needt-budget chat)

1. `frame-ancestors 'self' https://use.needt.app` and no `X-Frame-Options` for the embed.
2. An `embed=1` mode kept across navigation: no top bar, no tab bar.
3. `theme=` and the `needt:theme` message, from origin use.needt.app only.
4. In embed, no session goes straight to `/auth/needt/start` instead of `/login`.

## Open (owner)

- Whether Needt Pro grants Budget access (`access_kind = "pro"` in Budget, e.g. from a `needt_plan` claim). Until decided, a Pro account without its own Budget access sees Budget's own billing page inside the frame.

## Impact

- `src/lib/needt3/budget.ts` (pure), `src/lib/needt3/hooks/budget.ts`, `src/app/api/budget/nav/route.ts`, `src/app/(app)/budget/page.tsx`, `src/components/needt3/budget/BudgetScreen.tsx`, `src/styles/v3-overrides/budget.css`.
- Sidebar, phone menu (places, status, glyph, counts), Settings → General, `feature-flags(-keys).ts`, `security/csp.ts`, `section-titles.ts`, `query-keys.ts`.
- No schema change: both prefs are UI keys in `UserSettings.prefs`.
- New optional env: `NEXT_PUBLIC_BUDGET_URL` (default `https://budget.needt.app`).

## Rollout

Merge with the flag off. Turn it on for the owner with a per-user override, check on production, then widen. Before 17.11 only if it does not touch the launch; otherwise 18.11.
