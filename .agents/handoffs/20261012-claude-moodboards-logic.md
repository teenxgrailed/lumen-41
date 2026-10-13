---
id: 20261012-claude-moodboards-logic
owner: claude-moodboards-logic
branch: feat/moodboards-logic
status: active
updated: 2026-10-12T18:00:00Z
objective: Moodboards get the prototype's grid logic (items, add/upload/paste, detail, reorder, share, sort, Trash) on desktop and phone, backed by the items API
---

## Decision (canvas)

**Under `design_v3` the grid replaces the collaborative canvas as the board page (`/moodboards/[id]`). Flag off keeps the canvas exactly as before. Nothing is deleted, copied or rewritten.**

Reasons:

1. Owner ruling (data map §5 Q1, 2026-10-09): _"Grid (`MoodboardItem`) is the truth; the canvas tables stay untouched until a contract migration."_ The prototype has no canvas at all, and a second surface on the same board would split the references in two places.
2. The canvas is a free-form Excalidraw scene in a Yjs document (`MoodboardCollaborationState.state`, snapshots in `MoodboardSnapshot.scene`). Its elements have no order, caption, colour name or `position`, so they cannot be "migrated" into rows without inventing data, and a write-time migration would have to run against live collaborative state.
3. Hard rule: flag off renders as before, so `MoodboardWorkspace` stays on the flag-off route and the Yjs doc, the collaboration token route, the snapshots and the columns are not touched (no migration alters them).

What happens to what the canvas stored (read-side only, no writes on read):

- Existing `MoodboardItem` rows show as they are.
- Canvas content is **projected** into the grid when the board is read (`GET /api/moodboards/[id]/items`): image elements become photo tiles (served by a read-only route that streams the scene's file), text elements become notes. They come after the board's own items, carry ids that start with `canvas:`, are read-only (no remove, reorder or caption) and are marked `fromCanvas`. Shapes, arrows and freehand strokes have no grid form: the response says how many were left out (`canvasSkipped`) and `?view=canvas` on the board route opens the old canvas under the flag for anyone who needs them (no UI link: it is a recovery path, not a feature).
- The list route (`GET /api/moodboards`) does not read Yjs state (it can be megabytes per board); it sends `hasCanvas` so a canvas-only board's card does not claim "0 references".
- Reversible: removing the projection leaves every byte as it was.

## Scope

- Governing plan/spec: `docs/port/prototype/SCREENS.md` (Moodboards `mbApi`, `MbmRoot`, `PhbBoards`), `places.jsx` `MoodboardsScreen`, `phone-habits.jsx` `PhbBoards`, `docs/port/01-data-map.md` §7.
- In scope: the board page (grid) on desktop and phone, the items API (reorder, upload, unfurl, canvas projection), share roles, list sort, Free gate, Trash (Restore, Delete forever), Pinterest row as "Coming soon", the public "Anyone with the link" page.
- Out of scope: Pinterest itself, the browser extension, the phone share-extension walkthrough, `src/components/needt/**`, generated CSS (no CSS was needed: every class used is already vendored).

## Completed

Backend
- Migration `20261012100000_moodboard_assets` (additive, one table `MoodboardAsset`; bytes in the row like `PageAsset`; the canvas tables are untouched). `Moodboard.updatedAt` already existed; it now moves on every item / member / link change (`touchMoodboard`) and a title change.
- Items API: `PATCH /items` batch reorder (`position` renumbered 1..n, listed ids take the listed ids' places, 404 on a foreign id and nothing moves, 400 on duplicates/empty/over 500), `POST /items/upload` (multipart, type sniffed from bytes, 4 MB cap, asset + item in one transaction, 500 cap), `GET /assets/:id`, an uploaded picture's path allowed on `url` only for this board's own existing asset, canvas projection on `GET /items` (`fromCanvas`, `canvasSkipped`) and `GET /canvas-files/:id` (png/jpeg/webp/gif only, never svg).
- Link preview: `services/moodboards/unfurl.ts` on the importers' `services/imports/safe-fetch.ts` (https, default port, no credentials, every hop checked, private/loopback/link-local refused at connect, 1 MB, 4 s). Failure leaves the link as typed.
- List: `?sort=updated|created|name&dir=`, `hasCanvas`, `accessRole`, `owner`, `memberCount`, `members`; `DELETE ?permanent=true` (Trash only, full access); permissions: viewers may read who is on a board, `PUT` by email (workspace members only; nobody is emailed), anyone may remove themselves (Leave board).
- "Anyone with the link": `Moodboard.linkShare` honoured by `GET /api/public/moodboards/:id/:token` and the page `/b/:id/:token` (token = HMAC of the id under the auth secret; flag checked on every read; `/b/` added to the public routes in `middleware.ts`).

Desktop (`src/components/needt3/places/board/**`, route `/moodboards/[id]` under design_v3)
- Board page, Add menu (Upload images, Paste a link ⌘V, Colour, Note, Pinterest PRO + Coming soon), drop files, paste, link/colour/note dialogs, cards with the hover bar and menu, native drag to reorder (only a drop commits), item detail on the side (note autosave 400 ms, Saved, Copy link / hex, Open source, Remove), editable title, "‹ Moodboards" back, View as guest, Share dialog (invite email + View/Edit, change role, remove, Anyone with the link, Copy link) with roles enforced by the server. List: server-side sort, lock / faces on cards, Free gate and upsell unchanged. Trash: Delete forever for boards (two-step).

Phone (`src/components/needt3/phone/moodboards/**`)
- Photos (file picker), item sheet editing (title, note, colour name and hex saved on Done), Copy hex / link, hold-to-lift reorder (`useWallReorder`: transform only, one rAF per stream, `pointercancel` never commits, second pointerdown ignored, listeners removed on end and unmount), "Move to top", Share sheet, People for a guest of the board, Leave board, "Shared with you" section, covers from the list preview, Pinterest row Coming soon, Trash Delete forever behind a confirm sheet.
- One controller (`useBoardsController`) is called in `MoodboardRoute` / `MoodboardsRoute` above the 700 px switch and handed to both faces; it also owns the open reference, the open dialog and View as guest.

Tests: items route (reorder, upload, asset address, canvas, unfurl, Date updated, role matrix), unfurl SSRF cases (private IP, redirect to private IP, non-https, oversize, timeout, name that resolves privately), canvas projection, list sort / owner / members, public link, access service (viewer cannot write, invite, leave), detail route (permanent delete), client logic, board-order, hooks (reorder optimistic + undo, upload, edit), BoardPage dom, Wall dom (cancel, second finger, unmount, listeners), route dom (Free gate, sort). Mutations checked red: reorder role, wall cancel commit, invite role.

## Not ported

- Pinterest (connect, import, refresh, lost access): no integration exists. The Add menu row says PRO + Coming soon and does nothing; no gate was invented.
- "Get the browser extension" (mock in the prototype), the phone "How to save…" share-extension walkthrough (mock).
- Phone "Move to board…": needs a cross-board move route (todo in `PhoneBoardPage`).
- Invite by email for someone with no account here: only workspace members can be reached (as the docs Share sheet). `ShareInvite` exists but has no accept step (todo).
- Canvas shapes, arrows and strokes have no grid form; `?view=canvas` still opens the canvas under the flag (no UI link). The public link page does not show canvas tiles.
- Orphaned `MoodboardAsset` rows are purged opportunistically (upload and tile delete, 1 h grace); there is still no background job, so an abandoned board keeps its last pictures until someone writes to it (todo, with the Trash 30-day purge).
- Tasks' Delete forever and Empty Trash (other lane's routes).

## Security review follow-up (2026-10-12, second commit)

Fixed after an independent review, each with a test that goes red when the fix is removed:
- Link previews no longer run a regex over the page: the head (first 64 KB) is scanned with `indexOf` and a one-pass attribute reader, oversize tags are skipped, control characters and NUL are stripped from what is kept. A hostile 1 MB body parses in well under 100 ms.
- The public link token is `HMAC(id, linkTokenVersion)` (new additive column `Moodboard.linkTokenVersion`, migration `20261012140000`); turning "Anyone with the link" off bumps it, so an old address never returns. No new env key.
- Upload: access (EDITOR) is checked before the body is read; the 4 MB cap is counted on the bytes as they arrive (a missing or lying Content-Length does not skip it) and the stream is cancelled.
- Item create, upload and reorder lock the board row (`SELECT … FOR UPDATE`) inside the transaction. Pictures no tile shows and older than an hour are swept at upload time, so an emptied board takes uploads again; the 1000-picture cap answers "too many unused pictures" (409), not "full". A removed picture is no longer served (authed or public) unless a tile shows it; Undo re-adds the tile and so the picture.
- Reorder is one `UPDATE … FROM (VALUES …)` statement.
- Failed board-item writes refetch the scope (`rollback: "refetch"` in `useUndoableMutation`) instead of restoring a snapshot that could undo other successful edits.
- Delete forever needs the board's creator or a workspace owner. Public page: the domain is derived from the address (never client-supplied), `referrer: no-referrer`, only a whitelisted `source`.
- A board in Trash refuses item writes, uploads, grants, title and link changes (409/403); restore is the one change allowed, and leaving and reading stay allowed.
- The note autosave flushes a pending (under 400 ms) edit when the detail unmounts.

Known limits (not built): no re-unfurl when a link's url is patched; DNS resolution is outside the 4 s abort signal; reorder ties and gaps under concurrent writers resolve by the row lock order; the "Private" lock wording (owner question); hotlinked link thumbnails on the public page reveal the viewer's IP to that site; public assets have no ETag or rate limit.

## Integrator review of PR #155 (2026-10-12, third commit)

- Origin/main merged first (CHANGELOG union).
- Storage: `MOODBOARD_WORKSPACE_STORAGE_BYTES` (200 MB, `//todo` to move into PLAN_LIMITS) is the total of `MoodboardAsset.size` over the workspace's boards, summed inside the upload transaction after the board row lock; over it is `413` ("Your workspace's moodboard pictures are full (200 MB). Remove some pictures to add more."). Same for every plan, no new gate. Per-picture cap lowered to 1.5 MB (`MOODBOARD_IMAGE_MAX_BYTES`); the client downscale re-encodes lighter once when the first JPEG is over it. The 413/415/409-not-full replies are shown with `notify.error(message)` (only the 500-reference "full" stays an info notice).
- Orphans: deleting a tile sweeps the board's other pictures that nothing shows and that are older than the 1 h grace. The removed tile's own picture stays for that hour, so Undo (a new tile at the same address) works; after the hour Undo of that tile is refused cleanly (400) rather than showing a broken picture.
- Canvas decode: `readCanvasScene` reads `updatedAt` first and keeps the decoded scene in an in-process LRU keyed `boardId:updatedAt` (20 boards, 60 s TTL, one entry per board, never shared across boards; any write moves `updatedAt` and misses). Per-process only.
- Asset route: `Cache-Control: private, max-age=300` (a removed picture can linger in the viewer's browser up to 5 min; the server stops serving at once); CSP sandbox, nosniff and the live-tile check unchanged.
- Docs: `docs/connector-api.md` now says Delete forever is the creator or a workspace owner, plus the new caps.
- Unfurl rate limit: 30 reads per person per 10 min (in-process sliding window); over it the link tile is created as sent, no error.
- Not verified: multi-process behaviour of the cache and the limiter (each process has its own); Postgres (the `SUM(size)` is the Prisma aggregate on the existing column, no migration).

## Working state

- Files currently dirty or expected to change: none after the push.
- Foreign changes that must remain untouched: other lanes' branches and worktrees. NOTE: `node_modules` is shared between worktrees, so another lane's `prisma generate` replaces the generated client (it dropped `MoodboardAsset` once); rerun `npm run prisma:generate` if type-check says `moodboardAsset` is missing.

## Verification

- See the final report for the exact gate outputs of the head commit.
- Evidence: `.agents/handoffs/evidence/moodboards-logic/` (desktop prototype-left / port-right, light and dark: grid, sort menu, board, Add menu, item detail, Share; phone port only, light and dark: list, board, item sheet, Share). The prototype was served statically and the port rendered through a temporary, uncommitted harness page with a Playwright-stubbed `/api`.
- Not verified in a real browser: real upload (canvas downscale; jsdom has no canvas), real drag and drop with a mouse or finger (the pointer and drag logic is unit-tested with synthetic events; no real touch device), a live unfurl against the internet, the public `/b/` page, Postgres (the migration SQL comes from `prisma migrate diff` between the two schema files; it was not applied to a database), the phone prototype render (not captured).

## Decisions and constraints

- See "Decision (canvas)" above.
- Reorder lists ids and the server places them in the listed ids' slots, so a reference added by someone else meanwhile is not displaced, and Undo is the same call with the old order.
- New references go to the front of the wall (the prototype), by an explicit `position` (lowest − 1); the API default stays "end".
- A board is shown as private (lock, "Only you") when nobody else has a grant and the link is off. In a team workspace every member can still read a board by workspace role, so the lock overstates that case (owner question).
- The old canvas read is capped at 200 tiles and decodes the board's Yjs state on a cache miss (60 s LRU, see the third commit; no write, no state row created); `listMoodboards` never reads it.

## Blockers

- `None`

## Next action

- Review the PR (not opened). Apply migration `20261012100000_moodboard_assets`. Follow-ups: the Pinterest integration, Move to board, orphan asset purge, ShareInvite accept step.
