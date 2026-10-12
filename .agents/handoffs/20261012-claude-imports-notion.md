---
id: 20261012-claude-imports-notion
owner: claude-lane-imports-notion
branch: port/imports-notion
status: active
updated: 2026-10-12T00:00:00Z
objective: Import pages and databases from Notion through the import framework Todoist (#136) introduced
---

## Scope

- Governing spec: the Todoist importer (`src/services/imports/**`, #136); Notion docs read on 2026-10-12 (links in the PR body): authorization, request limits, retrieve page as markdown, enhanced markdown, working with markdown content, post-search, query a data source, data source object, refresh a token, upgrade guide 2026-03-11.
- In scope: OAuth (public integration) + the same state/nonce pattern, a typed fetch client (no SDK), discovery, page tree, enhanced markdown to page blocks, databases and rows, files downloaded into page assets with caps, idempotent re-runs, warnings, Settings -> Data -> Import row, docs, env template.
- Out of scope (v1): comments, views, live formulas, buttons, verification, templates, page permissions, synced-block sources, turning databases into tasks, wiki pages.

## Completed

- Framework generalised backwards compatibly: `IMPORT_SOURCES` has `notion`; OAuth state carries its source (a state without one is Todoist's); `startImportResponse` hands `authorizeUrl(workspaceId, source)`; `listImportRuns` returns the last 5 of each source; the runner dispatches on `run.source` and maps `NotionApiError` to `notion_<code>` warnings; Todoist tests untouched and green.
- `src/services/imports/notion/`: `client.ts` (version header per call, token bucket 3/s with injected clock, 429/529 Retry-After + jitter + bounded retries, 5xx retries, refresh once on 401, token envelope), `markdown.ts` (tag splitter + `@tiptap/markdown` against `pageEditorExtensions`, then `pageBlocksFromDocument`), `properties.ts`, `importer.ts` (discovery, tree, two passes), `prisma-store.ts` (user + workspace scoped), `ids.ts`, `types.ts`.
- `src/services/imports/safe-fetch.ts`: https only, no credentials, per-hop redirect checks, private/loopback/link-local/CGNAT/ULA/mapped/NAT64/6to4 refused, checked up front and again inside the connection's own DNS lookup, size cap while streaming.
- Routes `/api/imports/notion/authorize` and `/callback`; Settings -> Data -> Import has a Notion row (brand icon) beside Todoist; copy says the person picks the pages in Notion.
- Additive migration `20261012120000_import_asset_entity` (`ImportEntityType` gains `asset`, used to reuse files on a second run). `jest.config.js` maps `marked` to its UMD build (ESM only package, jest is CommonJS).
- `pageEditorExtensions` exported from `src/lib/pages/page-editor-schema.ts` (the schema is built from it, unchanged).

## Working state

- Files expected to change after review: none known. Foreign changes: none.

## Verification

- Passed: `rm -rf .next && npm run type-check`, `npm run lint`, `npm run tokens:check`, `npm run check:ui-contracts`, `npm run check:branding`, `npm run build:worker`, the Jest suites under `src/services/imports`, `src/app/api/imports`, `src/components/needt3/settings`, `src/__tests__/import-asset-migration.test.ts`. Mutations that turned tests red: dropping the workspace scope in the Prisma store, keeping the token on failure, ignoring last_edited_time, skipping link registration, removing a private range, removing child dedent.
- Not verified: anything against a real Notion workspace (OAuth consent, page picker, real markdown output, real file URLs and their hosts, rate limits, refresh token lifetime), the browser UI, the production build output on a live deploy.

## Decisions and constraints

- Notion-Version `2026-03-11` on every call (the markdown endpoint only exists there); the markdown endpoint returns enhanced markdown (v1) by default, which the splitter reads.
- Search returns pages and data sources (not databases); a data source's `database_parent` places it in the tree and a database link resolves through its data source's `parent.database_id`. Rows come from the data source query, not from search.
- Imported pages are private to their owner (`isPrivate`); a shared workspace shares nothing until the person chooses.
- Callout and toggle blocks are atoms in the page editor: the callout keeps its first line as text, the rest follows as ordinary blocks; a toggle keeps its title and its children follow as siblings.
- Only Notion-hosted files are downloaded (10 MB each, 200 MB a run); external URLs stay links.
- `<unknown alt="bookmark|embed|link_preview">` costs one `GET /v1/blocks/{id}` (at most 25 a page) to learn the real address.

## Blockers

- None.

## Next action

- Owner: create the public integration (redirect URI `https://use.needt.app/api/imports/notion/callback`, capability "Read content"), set `NOTION_CLIENT_ID` / `NOTION_CLIENT_SECRET` in production, switch `imports` on for one test user, run one import against a real workspace and read the notes.

## CHANGELOG line

- Import from Notion (behind the same `imports` flag): pick pages in Notion's own picker; pages, tables, images, files and databases with their rows come in, links keep working, and a second run only updates what changed.
