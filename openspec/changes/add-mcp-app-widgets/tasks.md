# Tasks

## 1. Resource plumbing

- [ ] 1.1 Add `widgets/registry.ts` with the three `ui://needt/*.html` entries (uri, name, description, mime type `text/html;profile=mcp-app`, html).
- [ ] 1.2 In `server.ts`: add `resources/list` and `resources/read`, the `resources` capability and the `io.modelcontextprotocol/ui` extension entry to `initialize`, all behind the `mcp-app-widgets` flag. Unknown URI returns a JSON-RPC error.
- [ ] 1.3 Confirm `route.ts` lets `resources/*` through bearer auth, Origin and rate limits without a tool scope check, and add them to the route test.
- [ ] 1.4 Add the `mcp-app-widgets` flag and the helper that decides, per request, whether the surface is on.

## 2. View tools

- [ ] 2.1 `needt_view_today` using the same services as `needt_list` for tasks and events; personal-workspace rule for events with a `note` in Team workspaces.
- [ ] 2.2 `needt_view_tasks` and `needt_view_project` reusing the task list and project progress loaders; include `workspaceId` in every result.
- [ ] 2.3 `tools/list` emits `_meta.ui.resourceUri` for the three tools when the flag is on.
- [ ] 2.4 Measure the `tools/list` size before and after and record it in the PR.
- [ ] 2.5 Tests: scopes (`needt.read` only, no `mail.read`), viewer seat is enough, workspace binding, private-tree content absent, text JSON unchanged for existing tools.

## 3. Bridge and shared view code

- [ ] 3.1 `widgets/bridge.ts`: `ui/initialize` handshake, `tool-result` listener (text, with `structuredContent` fallback), `tools/call` with id matching and timeout, host theme, size reporting coalesced to one rAF.
- [ ] 3.2 Test the bridge against a fake host (handshake order, out-of-order replies, host that never answers, malformed messages ignored).
- [ ] 3.3 `widgets/tokens.ts` plus a drift test that parses `needt-ds-tokens.css` and `needt-themes.css` and compares every copied value.
- [ ] 3.4 `widgets/base.ts`: reset, 13px and 12px scale, ring-first surfaces, 32px row, tick control, focus ring, reduced-motion.

## 4. Views

- [ ] 4.1 Task list view: rows, tick with optimistic update, reconcile to the call's answer, Undo for 8 seconds, error and rate-limit states, empty state, "Show more" with a count of hidden rows only.
- [ ] 4.2 Today view: header with the remaining-time sum, events and tasks interleaved by time, now-line mark, read-only ticks use the same code as 4.1.
- [ ] 4.3 Project progress view: title with project tile, done over total as a bar (mark, not a button), overdue shown as at-risk only, next tasks.
- [ ] 4.4 XSS test: titles, project names and event titles with markup render as text.
- [ ] 4.5 Dark and light snapshot test of the generated HTML string with tokens resolved (string-level, no browser).

## 5. Docs

- [ ] 5.1 `docs/connector-api.md`: the three tools, the scopes they need, the `resources/*` methods, what a widget can call.
- [ ] 5.2 `CHANGELOG.md` under `[unreleased]`.
- [ ] 5.3 Record in the PR which hosts were and were not exercised.

## 6. Rollout

- [ ] 6.1 Merge with the flag off; check `tools/list` and `initialize` are unchanged in production.
- [ ] 6.2 Owner checks the three views in claude.ai and ChatGPT with the flag on for their account (open question 5).
- [ ] 6.3 Widen the rollout bucket; watch MCP error rate and write-limit hits.

## 7. Follow-ups, not in this change

- [ ] 7.1 Habit streak and goal progress views.
- [ ] 7.2 Decide on an embedded font subset or `resourceDomains` for Inter.
- [ ] 7.3 Re-check the client matrix and adopt MCP core 2026-07-28 negotiation (`server/discover`, per-request `_meta`).
