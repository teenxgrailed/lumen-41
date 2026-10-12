---
id: 20261012-claude-doc-opened
owner: claude-lane-doc-opened
branch: fix/doc-opened
status: complete
updated: 2026-10-12T21:00:00Z
objective: The opened Document screen on the desktop matches the prototype (chrome, rail, sheet, blocks, inspector, menus) in light and dark
---

## Scope

- Governing spec: `docs/port/prototype/DocsScreen.jsx` (`DocumentScreen` 1613, `DocTopRight` 981, `DocPanel` 705, `InsertPanel` 1006, `InfoPanel` 1136, `DcStylePanel` 184, `SelectionBar` 1293, `DocSlashMenu` 1555), `doc-style.jsx`, vendored `src/styles/v3/docs.css`, SCREENS.md "Document". Read off the running prototype (`app-dev.html#doc/<id>`, 1440x900).
- In scope: the opened document at desktop width; flag-off and the phone face unchanged.
- Out of scope: the Docs list files (DocsScreen.tsx, DocMini.tsx, docs-miniature.css, page-preview*), the phone reader, route / overdue / Today / plan-badge / sign-out-all / calendar sync.

## Completed

- Top bar (`shell/Topbar.tsx`, `document/DocTopRight.tsx`): breadcrumb "Documents / title" in the command bar (no kbd hint), right side Saved dot, avatar, Insert, Share, Page options (⋯), then bell, help and the panel toggle (`sk-rtoggle`, ⌘⌥\). Insert opens the inspector on its Insert tab (or closes it); Share opens the Share sheet. The old Style / Share row above the page is gone, so the area starts under the top bar like the prototype's (y 52, page card at y 100).
- Editor header controls: `pages/doc-head-slot.ts` lets the top bar register two slots; `PageWorkspace` portals its collaborators / save state and its Page options menu there when a slot exists (otherwise its sticky header is drawn as before: flag-off, phone, Focus Mode). The menu opens in the v3 portal layer (`ui/popover.tsx` got an optional `container`) and is restyled as a v3 menu.
- Left rail (`document/DocRail.tsx`, `V3Shell.tsx`, `Sidebar.tsx`): an open document swaps the places for its own panel: back arrow, "hide panel" (toggles the sidebar), thumb + title + "Updated …", tabs Contents and Find, the bottom-left switcher (`sk-switch`, also shown under the places while a doc is open). Contents = title + the headings the page draws (ranked by the depths used, jump on click); Find = live count, previous / next, every match highlighted (CSS Custom Highlight API), match case.
- Sheet (`DocumentScreen.tsx`, `v3-overrides/doc-opened.css`): sheet padding 56/64/96 restored (it was 0), cover as the prototype's (margin -56/-64, 220 high), `is-faded` / `docs-bd-fade` / `data-dc-look` for the phone's Immersive / Faded, title 700 32/40 in the ink, wrapping (textarea in the chrome; Enter goes to the page), rule under it in the chosen Separator (line, dots, hand-drawn; also the divider block), body 16/24, headings 24/20/16 at 600, bullets / numbers 27px in, to-do box 16px (tick = accent mark), quote bar, code, table, image, callout (accent 14%, alert glyph) and the other special blocks as the prototype's tiles, placeholder "Type / for blocks", no focus ring on the page. The editor's toolbar is not drawn (the prototype has none).
- Inspector: tabs Insert / Style / Info (the strip now sits at y 56). Insert (`document/InsertPanel.tsx`): every block the editor can make in the prototype's groups; a click sends the editor's own command (`pages/page-commands.ts`, listener in `PageWorkspace`). Style: Separator Style segment added (the old `//todo`), PRO pills are the shared `ProBadge` (locked on Free), a Free tap opens the paywall sheet (`openPaywall("Document themes")`, was Settings -> Plan). Info: icon rows, Pin / Unpin, Versions (opens the editor's history), Delete, Numbers (words, characters, blocks, reading time from the editor's text).
- Menus: selection bar (B / I / S / code) and the "/" menu now draw as v3 surfaces (pill with floating shadow; 300px menu, 36px rows, icon chips, hint line hidden).
- Live title: the editor announces each write (`lib/needt3/page-events.ts`); `usePageEditSync` (hooks/docs) patches the cached doc and every cached list, so breadcrumb, rail and pinned list follow as you type. Before, the v3 caches only changed on a refetch.
- Tests (jest, 49 new): `document/__tests__` outline, open-doc, stats, insert-panel.dom, doc-rail.dom, css; `pages/__tests__/doc-head-slot`; `lib/needt3/__tests__/page-events`. Mutated three: outline without the empty-heading filter, Insert rows without `disabled`, `usePageEditSync` without the page-id check: each went red, then restored.
- Evidence: `.agents/handoffs/evidence/doc-opened/` (prototype vs port: launch light and dark, rules, Style / Insert / Info panels, "/" menu, selection bar, plus the port's Page options, Share, themes (paper serif, night mono, mist rounded wide), cover, blocks in dark, Free Style panel, empty page, and the before dark).

## Not ported (data-only or logic)

- Rail tabs Tasks ("Tasks in this document", fixture `DOC_TASKS`) and Files (fixture): no per-page task or file listing; Find has no Replace / Find all documents (the prototype's replace buttons are mock).
- Inspector Format tab (drives the prototype's own block model: card groups, block colours) and Info's "Review by Needt", "Who wrote what", Author, Present, Move to…, Duplicate and the Actions sub-tab (mock or no v3 flow / author field).
- Selection bar: Highlight, Link, Colour, Mention, Comment and "Make a task" (no marks / routes: `POST /docs/:id/mentions`, DocComment, `Task.source`); block hover tray (comment, react, turn into a task…); `lead`, `shot`, `cards`, `event`, `habit`, `ask`, `gallery`, `board` and `card` blocks have no block in the editor; the prototype's page-link, date chip, reminder and task badges come from blocks made on the phone.
- Cover Art (`art:` covers: the editor draws `coverUrl` as a picture URL); Share sheet's AI access per tool, Export tab and Can-edit link (no routes, data map M1 / M2); Insert's drag onto the page (click inserts at the cursor) and the Line / Page-break rows.
- Pro gating of the phone-only keys is unchanged.

## Working state

- Everything committed. Temporary harness `src/app/style/docopen` deleted. No other dirty files.
- Merge note: `src/styles/v3-entry.css` ends with `@import "./v3-overrides/doc-opened.css";`; fix/docs-miniature appends its own import on the same line range: keep both.

## Verification

- Real browser: headless Chromium (`/opt/pw-browsers/chromium`) against the dev server (webpack) with a temporary uncommitted harness (real `V3Root` + `DocumentFace` + `PageWorkspace`, Playwright-stubbed `/api`), and the prototype served statically; 1440x900 light and dark, plus 1100 and 800 wide spot checks. Measured sheet padding, radius, font, colour, shadow, title box, rule and first block offsets against the prototype: equal (the port's first row is at the prototype's 147).
- Functional run in the harness: Insert tab (Heading 2 added, Table added), outline follows, Find "1 of 7", title wraps (80 px), Enter focuses the page, breadcrumb follows the title, Separator dots applies.
- Gates (all green): `tsc --noEmit`, `npm run lint` (0 warnings), `CI=true TZ=UTC npm run test:unit -- --runInBand` and plain `npm run test:unit` (438 suites, 3766 tests, 5 suites skipped, after the review round), `npm run tokens:check`, `npm run check:ui-contracts`, `flock /tmp/build.lock npm run build` (+ postbuild), every `v3-overrides/*.css` parsed with postcss and brace-balanced, `check:agent-handoffs` clean for this file.
- NOT verified in a real browser: Safari / Firefox (Custom Highlight API for Find is Chromium / Safari 17.2+ / Firefox 140+; without it the count and stepping still work, matches are not marked), the real collaboration socket and real Page options dialogs (the harness answers 404 to the collaboration token and the editor falls back to its REST path), a Free-plan 403 round trip.

## Decisions and constraints

- The editor stays `PageWorkspace`; chrome moved around it with attributes (`data-page-title`, `data-page-meta`, `data-page-edited`, `data-collab`, `data-doc-menu`, `data-active`) and CSS scoped to `[data-doc-sheet]`; with no slot (old shell, phone, Focus Mode) it renders as before.
- Title is a `<textarea>` only in the chrome (wrapping, as the prototype's h1); the old `<input>` stays elsewhere.
- No new colour, grey, shadow or token; the callout, to-do tick and tile fills use `--accent`, `--fill-*`, `--doc-block`, `--shadow-*` as the vendored sheet does. Chrome type 13 / 12 only (the editor's "Saved" 11px is set to 12px in the chrome).
- Insert's hint reads "Click a block, or type / on the page." (the prototype's says "Drag a block onto the page…").
- New UI state for the document lives in `needt3-ui` (not persisted): `docTab`, `docShareOpen`, `docRail`, `docRailTab`, `docOutline`.

## Blockers

- `None`.

## Next action

- Integrator: review and merge; resolve the `v3-entry.css` / CHANGELOG adjacency with fix/docs-miniature by keeping both sides.

## CHANGELOG line

- Fixed (design_v3, opened document): the document screen matches the prototype at desktop width (top bar breadcrumb and Insert / Share, the document rail with Contents and Find, the sheet's title, rule and blocks, the Insert / Style / Info inspector, v3 menus).
