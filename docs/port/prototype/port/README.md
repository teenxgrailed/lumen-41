# port/ — what the code port starts from

Machine-made artefacts read out of the prototype, for the real codebase (one TS/React app, wrapped
by Capacitor for iOS / Android and Tauri for macOS / Windows — PORT.md §1a). Everything here is
**generated**: change the prototype, then regenerate; do not hand-edit outputs. Nothing here is
loaded by the prototype, and `build.js` does not touch it.

| Path | What | Regenerate |
| --- | --- | --- |
| `tokens/tokens.json` | W3C design tokens (DTCG): every theme-level custom property of the DS tokens + `themes.css` + `app.css` + `styles/*.css`, grouped (color, surface, ink, accent + 9 presets, sky, glass, radius, space, type, shadow, blur, motion + MOTION.md curves / duration scale, z, component.*), light value in `$value`, every mode in `$extensions["app.needt"].modes` | `node port/tools/extract-tokens.js` |
| `tokens/tokens.css` | the custom properties regenerated **from tokens.json** — the round-trip proof (the extract script re-parses it and fails on any difference) | same (or `node port/tools/build-tokens-css.js`) |
| `tokens/tokens-report.md` | unused tokens (grep of every live file + DS bundle), read-only-dynamically tokens, duplicate values, dead redeclarations, DS values the app overrides, component-scoped variables | same |
| `tokens/README.md` | token naming and modes | by hand |
| `types/needt.d.ts` | TypeScript types: every synced row (Task, Project, Doc + DocBlock / Span / BlockFmt / DocStyle, Template, Habit, HabitCheckin, CalendarEvent, MailThread + MailDraft, Board / BoardItem / BoardMember, Chat, AccessLink, Connections, Settings with every key + default, …), `SyncKeyMap` (each `NEEDT.schema` key → its value), the sync API (`NeedtSync`, `Change`, `Transport`, backend contract), `NeedtPlatform`, `NeedtApp`, `NeedtSettings`, the phone kit's public props, `pkDay`, `PlaceProps` + the `PkPlaces` registry | by hand from the code; check with `npx -y -p typescript@5 tsc --noEmit --strict --lib es2020,dom port/types/needt.d.ts` |
| `types/needt.schema.json` | JSON Schema (draft-07) generated from the row types in the d.ts (closed objects: an undeclared field fails) | `node port/tools/validate-fixtures.js` |
| `fixtures/<key>.json` | the demo seed, one file per `NEEDT.schema` key (`needt.tasks` → `tasks.json`, `needt.mail.threads` → `mail-threads.json` …), read through `needtSync` after **Reset prototype data**; seeds a store keeps in memory until its first write are read from that store | `node port/tools/export-fixtures.js` (needs the dev server, below) |
| `fixtures/index.json` | key → file, table, kind, row count, where the rows came from | same |
| `fixtures/_reference.json` | not synced but needed: built-in templates, people, stages, calendars, `SETTINGS_DEFAULTS`, `CN_CAL_SYNC`, accents, themes, the prototype's "today" | same |
| `strings/en.json` | user-visible UI copy, `{ _meta, "<file>": { "<Component>": { "<key>": "text" } } }` — JSX text, copy attributes, literals in JSX, toast / say calls, copy-named properties, `[id, "Label"]` pairs; seed / demo content excluded (it is in fixtures); template literals keep `{0}` placeholders | `node port/tools/extract-strings.js` |
| `tools/` | the scripts above | — |

## Regenerate everything

```sh
# once: tool deps in /home/claude/nb2 (no package.json change; install them in ONE command —
# a later `npm i --no-save` prunes packages installed by an earlier one)
cd /home/claude/nb2 && npm i --no-save postcss@8 typescript@5 ajv@8 ts-json-schema-generator@2 @types/react@18
# dev server for the fixture export
cd /home/claude/nb2 && setsid nohup python3 -m http.server 8766 >/dev/null 2>&1 &

cd /home/claude/nb2/needt-app
node port/tools/extract-tokens.js            # tokens.json, tokens.css (round trip), tokens-report.md
node port/tools/export-fixtures.js           # fixtures/* (Playwright, app-dev.html?ui=desktop, reset first)
node port/tools/validate-fixtures.js         # schema from the d.ts + every fixture checked (exit 1 on a failure)
node port/tools/extract-strings.js           # strings/en.json
npx -y -p typescript@5 tsc --noEmit --strict --lib es2020,dom port/types/needt.d.ts
```

`export-fixtures.js` resets the prototype's storage in its own headless browser profile only.

## Notes for the port

- **Stamps are not in the rows.** Every synced table gets `id, userId, updatedAt, deletedAt, rev,
  updatedBy` (`SyncStamp`); the fixtures hold the rows as the prototype stores them.
- **Events.** `fixtures/events.json` = the calendar's synced seed (`C2_EVENTS`, source google / apple)
  + the user's own events (empty after a reset).
- **Settings.** `fixtures/settings.json` is `needtSettings.get()` = `SETTINGS_DEFAULTS` + stored;
  the keys with no default (`mobileTiles`, `sidebarTiles`, `calHideDone`, `notify`, `usage`, `uses`,
  `taskSchedOpen`, `projectsView`) are typed optional with their fallback in the d.ts.
- **Strings** are a first pass for i18n: some copy is built by concatenation in code ("3 tasks were"
  + …), those fragments appear as separate entries and need rewriting into whole messages with
  plurals when the strings move to a catalogue.
