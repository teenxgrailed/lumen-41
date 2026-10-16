---
id: 20261013-claude-docs-feedback
owner: claude-lane-docs-feedback
branch: fix/docs-feedback
status: complete
updated: 2026-10-13T20:00:00Z
objective: Documents (design v3, desktop) show their previews everywhere, read in Light and Dark, and do not lag while typing
---

## Scope

- Governing plan/spec: `docs/port/prototype/docs-kit.jsx` (`DocThumb`, `MiniDoc`), `Sidebar.jsx` (`PinnedFace`), `DocsScreen.jsx` (`DocPanel`), `doc-style.jsx` (`dcInkFor`).
- In scope: Docs list rows, sidebar Pinned rows and the rail thumb draw the page's face (title + first lines); the Docs grid follows an edit at once; ink that cannot be read falls back to Auto; typing cost in the page editor.
- Out of scope: `src/styles/v3/**` (vendored), the phone reader, collaboration server.

## Completed

- Previews: `DocThumb` (docs/DocParts.tsx) draws `MiniDoc` (title + `MiniRows`) as the prototype does; the sidebar Pinned row uses it (`PinnedFace`), the rail thumb gets the rows from the cached Docs list. `PageWorkspace` announces the page's first lines (`PAGE_PREVIEW_EVENT`, `lib/needt3/live-preview.ts`, same `buildPagePreview` the server runs) 500 ms after typing and as the page is left; `useLivePreviews` (mounted in `V3Shell`, so it outlives the document screen) writes them into the cached doc and every cached list. Cause of the blank card: the list cache is fresh for 60 s and nothing told it about a body edit, and the collaboration server only stores a page 1.5-10 s after the last edit.
- Ink (`docs/style.ts` `inkFor`): "Dark" / "Light" text is taken as asked only while it reaches 3:1 on that reading of the page; otherwise Auto. A page has a Light and a Dark reading, so "Light text" on White was white on white in the Light theme (and dark on #2c2c2e in Dark).
- Lag: `PageAutosave` takes a reader and writes the recovery draft after a 250 ms pause (max wait 2 s), flushes on `pagehide`, hand-over to collaboration and `dispose`; the editor's extensions and props are memoised (`useEditor` re-applied the whole configuration on every render); collaborator awareness no longer re-renders the workspace unless the people changed; `DocumentScreen`'s observer reads Contents / Numbers after a 250 ms pause and does not write an unchanged outline.
- Not changed on purpose: the second icon button next to the back arrow in the document rail is the prototype's own ("Hide panel", `DocsScreen.jsx` `DocPanel`); it hides the sidebar here.

## Working state

- Everything committed on the branch.

## Verification

- Before / after, same tests, old `PageWorkspace`: 26 awareness events -> 26 `setOptions` (now 0); 5 title keystrokes -> 5 (now 0); 30 body keystrokes -> 30 `getJSON` (now 0 while typing, 1 per pause).
- Passed: `tsc --noEmit`, eslint (0 warnings), jest for the touched areas and `npm run test:unit`.
- Not verified in a real browser: no app could be run here (the disk was full for the whole session, a dev server did not fit). The CSS cascade of the sheet was checked in a static harness in Chromium (Light and Dark scope under a legacy-dark `<html>`): colours and backgrounds agree. The paint cost of the backdrops was read from the CSS (static gradients, one `blur()` layer only with `bdBlur`), not profiled.

## Decisions and constraints

- Draft written later than before (up to 250 ms, 2 s while typing without a pause): a crash in that window loses less than a second of typing; `pagehide` and `visibilitychange` write it at once.

## Blockers

- `None`.

## Next action

- Open the app in Light with a document whose Text is "Light", and profile typing in a long page with collaboration connected.
