---
id: 20261012-claude-docs-miniature
owner: claude-lane-docs
branch: fix/docs-miniature
status: ready-for-review
updated: 2026-10-12T16:20:00Z
objective: The desktop Docs list cards show the document miniature (first blocks, page colour, star, project line) like the prototype DocsScreen
---

## Scope

- Governing spec: `docs/port/prototype/docs-kit.jsx` (`MiniBlock`, `DocMiniature`), `DocsScreen.jsx` `DocCard` 344, `SCREENS.md` Docs grid; vendored `src/styles/v3/docs.css`.
- In scope: a short `preview` on `GET /api/pages`; `V3Doc.preview`; the miniature in the desktop card; the phone card draws the same rows (small reuse).
- Out of scope: Connections, places / Habits / Moodboards, Mailbox, Settings, `src/styles/v3/**`, `prisma/**`, `src/components/needt/**`.

## Completed

- API: `src/lib/pages/page-preview.ts` (pure `buildPagePreview`: rows `{type, text, checked?}`; types h1 h2 h3 p lead li ol todo quote callout code rule image; <= 8 rows, <= 120 chars a row, <= 600 in all; control chars, bidi / zero-width marks stripped; surrogate-safe clip; reads the stored tiptap `content.json`, the older `{text}` / `{html}` shapes, and the first text of a block too large to read). `src/services/pages/page-preview-service.ts` (`loadPagePreviews`, ONE raw query). `listPages(actor, { preview })` adds `preview` for live pages only; `GET /api/pages` passes `preview: true` unless `?preview=false`. `/api/pages/search` and every other `listPages` caller are unchanged.
- Client: `ApiPage.preview`, `V3Doc.preview?` and `previewFromApi` (defensive: known types only, clipped again) in `src/lib/needt3/map.ts`; `docs/DocMini.tsx` (`DocMiniature`, `MiniRows`); `DocsScreen` card draws it in the card page (the `//todo` there is done); phone `DocCard` draws `MiniRows` under the title.
- `src/styles/v3-overrides/docs-miniature.css` (imported last in `v3-entry.css`): `.docs-mini-half` (zoom 0.5, with a `@supports not (zoom)` fallback to the prototype's `scale(0.5)` at 200% width) and `.docs-mini-code`. No new colour, shadow or token.

## Working state

- Harness pages (`src/app/style/docs*`) were temporary and are deleted; none committed.
- Evidence: `.agents/handoffs/evidence/docs-miniature/` (before / after 1440 light and dark, the prototype's Docs screen, the phone card list).

## Verification

- Real Postgres 16 (temp cluster, `prisma db push`): `PAGE_PREVIEW_INTEGRATION=1 DATABASE_URL=… DIRECT_URL=… npx jest src/services/pages/__tests__/page-preview.integration.test.ts` (position order, legacy shapes, huge block, empty, 400-block page, private page not visible to a workspace viewer, other workspace sees nothing, trash and default list carry no preview). Skipped without the env, like the trash integration test.
- Query plan, 500 pages x 300 blocks (150 000 rows), 12 blocks read per page, 6 000 rows back: 20 ms warm (50 ms cold), 7 500 buffer hits, index scan on `(pageId, parentBlockId, position)` under a Limit per page. The same query with `ORDER BY "position"` only fell back to a bitmap scan of all 300 blocks per page: 152 000 buffer hits, 175-225 ms. Hence `ORDER BY "parentBlockId", "position"`.
- Unit: `lib/pages/__tests__/page-preview.test.ts`, `services/pages/__tests__/page-preview-service.test.ts` (one extra query for 60 pages, ids = the scoped list's ids, order, no query without the option / for the trash / for no pages), `app/api/pages/__tests__/list-preview.test.ts`, `lib/needt3/__tests__/doc-preview-map.test.ts`, `needt3/docs/__tests__/docs-cards.dom.test.ts` (every row type, star, project and Updated lines, empty and no-preview cards, text never markup, click opens), phone `docs.dom.test.ts` (rows under the title). Mutated three things, each went red: card without the miniature, no clip in the extractor, one query per page.
- Gates: tsc, lint (0 warnings), `test:unit` (`--runInBand` with CI/TZ, and plain: 401 suites, 3309 tests), `tokens:check`, `check:ui-contracts`, `npm run build` (+ postbuild check), every `v3-overrides/*.css` parsed with postcss, braces balanced.

## Decisions and constraints

- Prototype fidelity: the vendored `docs-mini-*` classes draw every row, as `MiniBlock` does. The one deviation is `zoom: 0.5` instead of `transform: scale(0.5)` at 200% width: wrapping is the same (measured: identical line breaks), but the card's box ends where the text ends, so "Cards by length" has no blank half-height band under a card without a backdrop (the prototype has it).
- The prototype's `cards` and `table` blocks have no equivalent in the stored page model: a table draws its first two rows as "a · b" lines; the "cards" block does not exist.
- No schema change. No locked / no-access state exists in the list: it only returns pages the person can see, and the preview is read only for those ids (the service documents that it does no access check of its own).
- `?preview=false` is the opt-out for callers that only want the old shape; the default is on, as asked.

## Blockers

- `None`.

## Next action

- Integrator: review and merge; nothing to run beyond the gates above.
