---
id: 20261103-claude-design-bridge
owner: claude (session "Needt design")
branch: one branch per PR (landing-*, fix/*)
status: active
updated: 2026-11-03T09:10:00Z
objective: Keep needt.app and the app's screens in line with the design system and the four rules
---

## Scope

- Governing plan/spec: integrator's list of 03.11 (items 1–10), PORT.md §0 rules, CLAUDE.md "Four rules".
- In scope: landing (branch `landing`, PRs from this stream, integrator merges and deploys); design ↔ code bridge (`design-bridge.md`); screen audits, one screen per PR.
- Out of scope: publishing into design-system artifacts without the owner's yes; the phone (Plates) density's own sizes and ink ladder.

## Completed

- #544 design-bridge map · #545 landing v42 · #547 /refund → terms 5.5 · #550 home weight · #551 home sharing tags + sitemap dates · #555 footer Support · #557 header safe area.
- Token check: code (`src/styles/needt-ds-tokens.css`) equals "Needt Design System Main" in light/dark/dim after var() resolution; artifact defect: `--foreground-rgb` not redefined in dark/dim (reported, not published).
- Agents screen (#542): no deviations.
- Home desktop: #558 14px → 13px, #559 bars on the text ladder, #560 titles 22px.
- Calendar (#561): 14px → 13px (day number, peek title/input, slot time), hour lines `--fill-4` instead of `--border` × .7.

- Tasks: 14px → 13px on `.tk-prev-title`, `.wk-mcard-name`, `.wk-padd-input`; done-row, disabled and dragging fades and the accent drop line left as they are.

## Working state

- Scripts for the landing live outside git in `/Users/lol/Needt/_landing-build/` (`perf_v43.py`, `bust_v43.py` = styles v=60, `seo_v43.py`, `support_v43.py`, `nav_v43.py`).

## Verification

- Passed: CSS rule tests per PR (`src/styles/__tests__/ha-home-desk-*.test.ts`, `calendar-rules-css.test.ts`); home and calendar component suites; landing headless checks on the Mac (owner allowed 03.11).
- Not run / still required: visual check of the 13px changes on a real screen.

## Decisions and constraints

- Owner 03.11: PRs into `landing` are fine, the integrator merges and deploys by hand.
- Owner 03.11: headless landing checks on the Mac are allowed; nothing opens on screen.
- Integrator 03.11: greys made by opacity are fixed only when the result is off the ladder; whole-element fades (disabled, locked preview) stay.

## Blockers

- Landing item 3 (Agents section) and the Agents part of item 6: owner to choose a page `/agents/` or a home section (Agents already sits in Updates; one feature, one place).
- For the owner: `.ha-mine` badge at 600 10.5px on Home (micro-label, off the 13/12 scale) — left as is by the integrator, owner to confirm.

## Next action

- Audit Settings, then Docs, against the four rules; one PR each.
