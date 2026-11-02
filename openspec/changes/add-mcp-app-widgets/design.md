## Context

- The remote MCP server is `src/app/api/mcp/route.ts` plus `src/services/connectors/mcp/`. It is stateless Streamable HTTP with JSON responses and hand-written JSON-RPC (`server.ts`) that implements only `initialize`, `ping`, `tools/list`, `tools/call`. It negotiates protocol versions up to `2025-11-25`. Capabilities today: `{ tools: { listChanged: false } }`. A tool result is JSON in one `text` content item (`toolResult` in `tools.ts`).
- Auth: every request carries a bearer token (OAuth from claude.ai or ChatGPT, or a personal `needt_` token). The route checks the Origin header, IP and per-person rate limits, then `requiredScopes(tool, args)` against `hasScopes(auth, needed)` before the tool runs. Scopes: `needt.read`, `needt.write`, `mail.read` (metadata only), `needt.admin.read`. Writes are limited to 30 per minute per person, and a rate-limited tool call comes back as a tool result carrying `retryAfterSeconds`, not as a transport error.
- Workspace binding: OAuth clients cannot send a header, so every tool takes an optional `workspaceId`, resolved by `workspaceAccess` / `writeAccess` (viewer seat to read, editor seat to write, plus the workspace bound to the token). Events, calendars, personal time and mail answer only from the personal workspace.
- Private pages: MCP reads pages as an AI actor (`mcpPageActor`, `ai: true`); `needt_search` says private pages are never searched; page create and append refuse a private tree.
- Mail: `mail.read` returns sender, subject, snippet and labels, never a body, and only in the personal workspace.
- Design authority: `docs/handoff/PORT.md` (section 0 rules, section 4 task object, section 6 motion), shipped tokens in `src/styles/needt-ds-tokens.css` and `needt-themes.css` (scoped under `.needt-v2`).

## Goals

- A client with MCP Apps renders a Needt view inline for three tools; every other client behaves as today.
- A widget can never read or write anything the same token could not read or write through a plain tool call.
- Each view is one HTML document with no network access.

## Non-Goals

- A general widget framework, a React build for widgets, display-mode switching, streaming partial input.
- Changing any existing tool's result shape.
- Showing pages, mail, habits or goals in a view (next slice).

## Decisions

### 1. Three new tools, not UI on `needt_list`

`resourceUri` is per tool, not per call. `needt_list` and `needt_get` are polymorphic, so a task widget cannot be attached to them without also rendering for project, mail or page results. Three dedicated read-only tools (`readOnlyHint: true`, `destructiveHint: false`, `openWorldHint: false`, like the other reads) return the object shapes `needt_list` and `needt_get` already return, plus a small header the view needs (day boundaries in the person's time zone, counts). They reuse the service functions behind `listRows` / `getRow` and the project and goal progress loaders, so there is one definition of "today's tasks" and "project progress".

- `needt_view_today { date?, workspaceId? }` returns `{ date, timeZone, events[], tasks[], note? }`.
- `needt_view_tasks { projectId?, status?, limit?, cursor?, workspaceId? }` returns `{ workspaceId, tasks[], nextCursor }`, limit capped by `MCP_LIST_LIMIT_MAX`.
- `needt_view_project { projectId, workspaceId? }` returns `{ workspaceId, project, counts: { total, done, open, overdue }, nextTasks[] }`.

Each description says what a model should use it for ("Show ... to the person") and that the result is the same data whether or not a view renders.

### 2. Link, visibility and negotiation in a stateless server

`tools/list` adds `_meta: { ui: { resourceUri: "ui://needt/today.html" } }` (and the other two) to the three tools. We always emit it and do not try to detect client support: the server keeps no session between `initialize` and `tools/list`, and the spec says a host without support treats the tool as plain. `initialize` returns `capabilities: { tools, resources: {}, extensions: { "io.modelcontextprotocol/ui": {} } }` so a client that looks for a server-side declaration finds one. Two guarded risks: a strict client that rejects unknown `_meta` (none known; it is a spec field), and the 2026-07-28 core revision's `server/discover`. Both are covered by the flag (decision 7) and a task to re-check when we adopt 2026-07-28.

`needt_complete_task` and `needt_undo` keep default visibility `["model","app"]`, which is what lets a view call them. We do not add an app-only twin: a second write path is a second place for scope, workspace, role and undo rules to drift.

### 3. The official SDK for the bridge (owner decision 2026-11-02)

The view side uses the `App` class from `@modelcontextprotocol/ext-apps` (pinned exact version, added to `package.json`) for the `ui/initialize` handshake, `tool-result` delivery and `tools/call`. The owner chose it so the bridge follows the standard as it moves (the 2026-07-28 core revision already changes negotiation) instead of us tracking it by hand.

There is no bundler for widget HTML, so `widgets/bridge.ts` reads the package's prebuilt browser ESM build once at module load and inlines it into each HTML as a `<script type="module">`. First task: confirm the package ships a standalone browser build with no bare imports; if it does not, add a one-file esbuild step at build time that writes `widgets/bridge.generated.js`, checked in and verified by a test that rebuilds it. Our own code in the view only calls `App` methods, so a version bump touches one line.

### 4. Resources: static HTML, data never in the template

`resources/list` returns the three `ui://needt/*.html` entries with `mimeType: "text/html;profile=mcp-app"`. `resources/read` returns `contents[0] = { uri, mimeType, text, _meta: { ui: { prefersBorder: false } } }` and declares no `csp` and no `permissions`, so the host default applies (`connect-src 'none'`, no external origins, no camera or clipboard). The HTML is identical for every person and contains no user data and no token; all data arrives in the `tool-result` notification. `resources/*` need a valid bearer token (like everything on the endpoint) and no particular scope, since they expose only static markup. An unknown `ui://` URI is a JSON-RPC error, never a fallback to another resource.

Because there is no `connectDomains`, `_meta.ui.domain` is not needed. If a later slice adds a network call, Claude's required domain for `https://mcp.needt.app/mcp` is `6c9913db8f7daab1c2e61a108260b35c.claudemcpcontent.com` (algorithm in the proposal); `https://use.needt.app/api/mcp` hashes differently, so that alias must be tested separately.

### 5. Authorisation: the widget has no authority of its own

The host proxies a view's `tools/call` to the same MCP connection and bearer token. So:

- A tick is `tools/call needt_complete_task { id, done }`. The route runs `requiredScopes` (`needt.write`), the write rate limit and `writeAccess` (editor seat, bound workspace) exactly as for a model call. A read-only token gets `insufficientScopeResponse`; the view shows "This connection can read but not change tasks" and leaves the box unchanged.
- View tools declare `needt.read` only. Mail is neither input nor output of any view tool, so `mail.read` is not required and not exercised.
- Every view tool result carries the `workspaceId` it resolved, and the view sends it back on every call, so a tick can never land in a different workspace than the one shown.
- Private pages: the three tools return tasks, events and projects only, never page titles, bodies, previews or links. A task with `originPageId` is returned with that id only if `needt_list` returns it today; the implementation must add no page fields. A test asserts that no content from a private tree appears in any view tool result.
- Events remain personal-workspace only: in a Team workspace `needt_view_today` returns tasks and a `note` that events are personal, mirroring `needt_list`.
- Tool results are data. A task title containing markup is rendered with `textContent`, never `innerHTML`. A test feeds a title of `<img src=x onerror=alert(1)>` and checks it appears as text.

### 6. Result shape and the text fallback

`content[0].text` stays pretty JSON as today and the view parses it. We do not add `structuredContent` in this slice: it would double the tokens the model reads for no gain, since the JSON text already is the machine-readable form. If a host delivers `structuredContent` only, the view falls back to it. Every view tool works with no view: the model reads the JSON, and an API client gets the same data it gets from `needt_list` and `needt_get`.

### 7. Flag and limits

A server-controlled flag `mcp-app-widgets` (`src/lib/feature-flags.ts`) gates together: `_meta.ui` on `tools/list`, the `resources` capability and `resources/*` methods, and the extension entry in `initialize`. With the flag off the three view tools still exist and return JSON (they are ordinary read tools), but no client is told about a UI. `resources/read` counts toward the existing per-person and per-IP limits. For a rate-limited tick, the view reads `retryAfterSeconds` from the tool result, shows "Too many changes, retry in N s" and restores the box.

### 8. Design: what a view looks like

Rules come from PORT.md section 0 and CLAUDE.md, applied to a small iframe.

- **Tokens.** A single `widgets/tokens.ts` string with the light base set and the dark set, copied from `needt-ds-tokens.css` and `needt-themes.css`: `--background`, `--surface-raised`, `--foreground-rgb`, the text ladder (100/85/70/55/40/25), fills (2/3/4/6/8/12), `--border`, `--accent`, `--success`, `--destructive`. A Jest test parses both CSS files and fails if a copied value drifts, so a design-system change becomes a failing test, not a silent divergence. Theme comes from the host (`hostContext.theme` in the `ui/initialize` result), with `prefers-color-scheme` as the fallback. The view never invents a grey.
- **Type.** 13px and 12px in the chrome; the day heading is document text at 16px; no 14px. Font stack `Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` with no `@font-face` and no network: where Inter is not installed the system face is used. The self-hosted fonts in `needt-fonts.css` are unreachable under the default CSP. Embedding a subset as a `data:` URI costs tens of KB per view and is deferred. If Inter is wanted later, the route is `resourceDomains` for a Needt-owned font origin plus a CSP review, never a third-party CDN.
- **Elevation.** Ring-first. A flat `--background` canvas, objects on `--surface-raised`, a 1px `--border` hairline, no shadows. No card inside a card: the host draws the frame, so `prefersBorder: false` and the view adds none.
- **Rows.** The `row` layout of the task object (PORT section 4): 32px rows, a flat tile in the project hue with its glyph, title, due date or duration as secondary text at the 70% step. Red marks at-risk only. We do not import `RichBlock.jsx`: the iframe has no React bundle and a row is a few elements. This is a known fork of a component PORT.md says not to fork. Mitigation: the view renders only the `row` layout, uses the same tokens and gives each carrier the same meaning; the spec lists the carriers it implements.
- **Accent.** Never a solid fill on a control. The tick and "Show more" are recessed controls with a ring and a `--fill-3` hover; the checked state is a `--success` check glyph (a mark) inside a ring. Focus ring is accent at 24%.
- **Counts.** A tally above rows that are all visible is noise, so the task list has no "12 tasks" header. The Today header shows the remaining-time sum; a count appears only for rows hidden behind "Show more".
- **Motion.** The row that changed (just ticked) rises and settles over 0.42s; nothing else moves and no list reflows with animation. No spring. Under `prefers-reduced-motion` there is none.
- **Size.** The view reports its height so the host frame fits the content. Lists scroll inside the frame past 8 rows (a constant; PORT's group rule says six for a calendar block, and the frame here is wider).
- **Observers.** One observer on the root, coalesced to one `requestAnimationFrame`; none per row.

### 9. Layout in the repo

```
src/services/connectors/mcp/widgets/
  bridge.ts      // inlines the ext-apps App browser build as a string
  tokens.ts      // copied tokens
  base.ts        // shared reset and row styles
  today.ts  tasks.ts  project.ts   // each exports { uri, name, html }
  registry.ts    // uri -> resource, used by resources/list|read and tools/list _meta
  __tests__/     // registry, token drift, bridge with a fake host, XSS, scope tests
```

HTML is assembled from strings at module load: no build step, no bundler, served from memory.

## Risks and Trade-offs

- **Uneven host support and spec churn.** Pin to extension spec 2026-01-26, keep the flag, degrade to text, re-check the client matrix before each release.
- **A strict client rejects `_meta.ui` or the `extensions` capability.** Mitigation: the flag, with first rollout to the owner account and then a widening bucket from `feature-flags.ts`.
- **Larger `tools/list`.** Three tools and three `_meta` objects; measured in task 2.4, descriptions kept short.
- **Fork of the task row.** Accepted and documented (decision 8).
- **Prompt injection through task titles.** A title is untrusted text that the model already reads in the JSON; the view only renders it as text. `ui/message` is sent only from an explicit click, with text fixed by the view and never built from task content.
- **A tick on a stale view.** `needt_complete_task` is idempotent and returns the current state; the view reconciles to what the call returned.
- **Undo.** The write result carries `actionId`; the view shows "Undo" for 8 seconds, which calls `needt_undo`. A stray click is cheap to reverse and no confirm step is added.

## Migration Plan

Additive. Ship with the flag off, enable for the owner account, verify by hand in claude.ai and ChatGPT, widen the bucket, then default on. Rollback is the flag. No schema change.

## Open Questions

See the end of proposal.md. Answers to 1, 4 and 6 change tasks 2, 3 and 4.
