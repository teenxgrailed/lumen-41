# Needt prototype — FROZEN (09.10.26)

Design for desktop and phone is final. This folder is now the reference spec for the web port.
No more design or feature changes here; all further work happens in the new code repository.
Bug fixes here only if they change the spec, and then note them below.

## Entry points
- `app.html` — one program: phone UI below 700 px or on iOS/Android, desktop otherwise (`?ui=phone|desktop`).
- `index.html` — desktop preview · `mobile.html` — phone preview.
- `*-dev.html` — source pages (JSX via Babel), `build.js` builds the three above.

## Spec documents
- `PORT.md` — porting brief: data model, sync contract, platform API, phone kit, docs model.
- `COMPONENTS.md` — every live component with props and suggested target module.
- `SCREENS.md` — screens, states, transition map (desktop + phone).
- `MOTION.md` — every animation: what, duration, curve, trigger, reduced motion.
- `HANDOFF.md`, `UI-RULES.md` — rules.
- `port/` — tokens (JSON + CSS), TypeScript types, fixtures + validator, UI strings (en.json).

## Known open items (carry into the port)
- Scheduling engine (min block, deadline, splitting) exists as data + UI only — build for real.
- Composers put a parsed "deadline" word into `dueDate`, not `deadline`.
- Phone has no doc selection bar (Mention / Comment / Make a task are desktop only).
- `build/*.map` on the Mac copy are stale (disk was full); regenerate with `node build.js` if needed.
- Not tested on real iOS Safari / Android / Mac / Windows — only Chromium + headless WebKit.
