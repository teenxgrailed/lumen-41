# Design port (2026-10)

- `prototype/` — the prototype, **FROZEN 2026-10-09** by the owner (see
  `prototype/FROZEN.md`): final for desktop and phone, read-only. Spec files:
  `PORT.md`, `COMPONENTS.md` (every live component, props, target module),
  `SCREENS.md`, `MOTION.md`, `UI-RULES.md`, and `prototype/port/` (tokens as
  JSON + CSS, TypeScript types, fixtures + validator, UI strings `en.json`).
  Port from here, never edit it. The trial Exposure font, build output,
  archives and icon explorations are left out; the licensed font is
  `public/fonts/ExposureVAR.woff2`.
- `01-data-map.md` — prototype fields → Prisma, migrations M1–M3, owner decisions.
- `02-task-plan.md` — 40 tasks (T01–T28 desktop, P1–P12 phone), streams, rules.

Branches: `port/integration` collects everything behind the `needt-v3` flag;
each stream works on `port/<stream>` in its own worktree and opens a PR into
`port/integration`. Nothing reaches `main` until the whole port is reviewed.
