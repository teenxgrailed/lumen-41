## Why

Needt's MCP server answers with JSON text. In Claude, ChatGPT and other clients a person asking "what is on today" gets a block of JSON that the model then re-describes, and a tick box is a second prompt away. MCP Apps (the `ui://` extension, SEP-1865) lets a tool name an HTML view that the client renders inline in the conversation, with that view able to call tools back. That puts Needt's own picture of the day in the chat and makes "tick this off" a click instead of a sentence. It is also a way to be useful in the clients where people already are, which fits the product rule that Needt's data is reachable from outside and not only through our screens.

Plain-text results stay exactly as they are. A client without MCP Apps support, or a model that never looks at the widget, loses nothing.

## What Changes

- The MCP endpoint (`src/app/api/mcp/route.ts`, `src/services/connectors/mcp/`) learns the MCP Apps surface: it advertises the `io.modelcontextprotocol/ui` extension, answers `resources/list` and `resources/read` for `ui://needt/...` resources with mime type `text/html;profile=mcp-app`, and puts `_meta.ui.resourceUri` on the tools that have a view.
- Three new read-only tools, each returning JSON text built from the same service functions as `needt_list` / `needt_get`, plus a view: `needt_view_today` (events and tasks for a day), `needt_view_tasks` (a task list with tick boxes), `needt_view_project` (project progress). Existing tools and their results do not change.
- Three self-contained HTML views, one per tool, built from source in the repo. No network, no external fonts, tokens copied from the shipped design system and checked by a test.
- A tick in the task list calls the existing `needt_complete_task` through the host. It runs the same bearer auth, `needt.write` scope check, workspace binding, role check and 30-writes-per-minute limit as a model-initiated call. No second write path is added.
- The whole feature sits behind a server-controlled flag, so it can be switched off without a deploy.

Out of scope for this slice: habit streak, goals, pages, mail, forms that create things, display modes beyond inline, widgets that call anything except `needt_complete_task`, `needt_undo` and the view tools themselves, and any direct `fetch` from a widget to Needt's HTTP API.

## Capabilities

### New Capabilities

- `mcp-app-hosting`: how the MCP server advertises, serves and secures `ui://` resources, how tools link to them, what the sandbox and CSP are, and how scopes, workspace binding, the mail metadata-only rule and the private-pages rule carry over to a widget.
- `mcp-widget-views`: what the three first views show, how they behave (tick, undo, empty, error, rate limit, theme), and the design rules they follow.

### Modified Capabilities

<!-- None. No existing OpenSpec capability owns the MCP server; docs/connector-api.md is updated as part of the tasks. -->

## Impact

- Code: `src/services/connectors/mcp/server.ts` (initialize result, `resources/*`), `tools.ts` (three tools, `_meta` on `tools/list`), new `src/services/connectors/mcp/widgets/` (bridge, tokens, three views, registry), `src/app/api/mcp/route.ts` (`resources/*` pass auth; no scope change for tools).
- Docs: `docs/connector-api.md`, `CHANGELOG.md` under `[unreleased]`.
- Tests: Jest unit tests for the registry, the `resources/*` handlers, scope and workspace behaviour of the view tools, the private-page and mail rules, a token-drift test, and a fake-host test of the widget bridge. No browser is needed in CI for the first slice.
- Dependencies: `@modelcontextprotocol/ext-apps`, exact version pinned, for the widget bridge (design.md, decision 3; owner decision 2026-11-02).
- Risk: client support is uneven and changes monthly (see below). The feature must be invisible when unsupported, and `tools/list` grows by three tools and some `_meta` bytes.

## Research: where MCP Apps stands (checked 2026-11-02)

| Fact | Detail | Source |
| --- | --- | --- |
| Status | Official MCP extension since 2026-01-26. Spec version `2026-01-26` is Stable, a `draft` exists. Extension id `io.modelcontextprotocol/ui`. | [MCP blog, 2026-01-26](https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps), [ext-apps repo](https://github.com/modelcontextprotocol/ext-apps) |
| Tool link | `tool._meta.ui.resourceUri = "ui://..."`. The flat `_meta["ui/resourceUri"]` is deprecated. `_meta.ui.visibility` is `["model","app"]` by default; `["app"]` hides a tool from the model. | [spec 2026-01-26](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx) |
| Resource | URI starts with `ui://`. `resources/read` returns `mimeType: "text/html;profile=mcp-app"` with `text` or base64 `blob`. | same |
| CSP | Declared in the resource content `_meta.ui.csp` as `connectDomains`, `resourceDomains`, `frameDomains`, `baseUriDomains`. If omitted the host MUST apply: `default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' data:; connect-src 'none'`. The host may restrict further, never loosen. | same |
| Sandbox | Web hosts render the view in a sandboxed iframe behind a proxy on a different origin, with `allow-scripts allow-same-origin`. `_meta.ui.permissions` (camera, microphone, geolocation, clipboardWrite) is a request the host may refuse. | same |
| Calls back | JSON-RPC 2.0 over `postMessage`: `ui/initialize` then `ui/notifications/initialized`; the host sends `ui/notifications/tool-input` and `ui/notifications/tool-result`; the view sends `tools/call` (proxied to the same server, only for tools whose visibility includes `app`), `ui/message` (adds a message to the chat), `ui/open-link`. The SDK also has an update-model-context call; its exact wire name is not confirmed in the spec text we read and must be checked before use (we do not use it in this slice). | same, plus [SDK docs](https://apps.extensions.modelcontextprotocol.io/api) |
| Negotiation | Client declares `extensions["io.modelcontextprotocol/ui"].mimeTypes` in `initialize`. Under the newer core revision 2026-07-28, extension declarations move into each request's `_meta` and servers expose theirs in `server/discover`. | [MCPBundles host guide, checked 2026-10-20](https://docs.mcpbundles.com/guides/mcp-apps-host-compatibility) |
| Fallback | Servers SHOULD keep a meaningful `content` array for every UI-enabled tool; a host without support treats the tool as plain. | spec 2026-01-26 |
| SDK | `@modelcontextprotocol/ext-apps` is at v2.x (2.0.1 dated 2026-09-24 by one tracker; Context7 lists 2.0.3 and 1.7.5). The `App` class is a convenience; the protocol can be spoken directly. | [agentsurface.dev](https://agentsurface.dev/docs/agentic-ui/mcp-apps), Context7 `/modelcontextprotocol/ext-apps` |

Client support, as of 2026-11-02. The official matrix at modelcontextprotocol.io/extensions/client-matrix was fetched 2026-11-01 but its tick cells did not survive extraction, so the rows below combine the MCP project overview, vendor docs and third-party checks:

| Client | MCP Apps | Note |
| --- | --- | --- |
| Claude web, Claude Desktop | Yes, since 2026-01-26 | Named in the MCP launch post. Claude's docs: interactive connectors show as inline cards or fullscreen; Team and Enterprise owners can turn off specific tool calls (MCPBundles, 2026-10-20). Claude wants `_meta.ui.domain` set to the first 32 hex characters of sha256(server URL) plus `.claudemcpcontent.com`; for `https://mcp.needt.app/mcp` that is `6c9913db8f7daab1c2e61a108260b35c.claudemcpcontent.com` (computed 2026-11-02; needed only if a view makes network calls). |
| Claude iOS / Android | Yes per MCPBundles (2026-10-20) | Not confirmed on a device by us. |
| Claude Code | A row in the official matrix; support not verified | A terminal cannot draw an iframe; treat as text only until checked. |
| ChatGPT | Yes, on the web for Business and Enterprise/Edu workspaces (MCPBundles, 2026-10-20) | OpenAI documents MCP Apps in its Apps SDK docs and reads the standard `_meta.ui.resourceUri`. The vendor key `openai/visibility` was deprecated 2026-07-21 per agentsurface. |
| VS Code (GitHub Copilot) | Yes, behind an experimental setting (MCPBundles, 2026-10-20) | Announced 2026-01-26 on the VS Code blog. |
| Cursor | Yes (added around v2.6) | Steve Kinney 2026-03-12; MCPBundles 2026-10-20. |
| Goose, Postman, MCPJam, Microsoft 365 Copilot, Archestra.AI | Yes | MCP project overview. |
| PostHog Code, Kiro Crew | Listed in the matrix | Not checked by us. |

Conclusion: the clients that matter to Needt's users (Claude, ChatGPT, VS Code) render MCP Apps, with Claude the only unconditional one. Support is not uniform, so every view must degrade to text and no tool may depend on its view.

## Owner decisions (2026-11-02)

All seven open questions were answered with the recommended option:

1. **Tools:** three new read tools, `needt_view_today`, `needt_view_tasks`, `needt_view_project`; `needt_list` stays plain for API use.
2. **Plan gate:** none added. Widgets follow whatever MCP access a plan already has.
3. **Write consent:** no Needt-side confirmation for a tick. It is idempotent, rate-limited and undoable via `needt_undo`.
4. **Bridge:** the official `@modelcontextprotocol/ext-apps` SDK, exact version pinned (design.md, decision 3).
5. **Real-host check:** the owner checks the first build in claude.ai and ChatGPT from a 5-step list that ships with the PR. Agents do not open browsers.
6. **Done mark:** a `--success` check glyph inside a ring. Accent is never a fill.
7. **Team workspaces:** the Today view shows tasks only and says that events are personal.
