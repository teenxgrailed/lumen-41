# Tasks

## 1. Schema, flag, identity

- [ ] 1.1 Prisma models `HubAgent`, `HubAgentToken`, `HubItem`, `HubItemEvent`, `HubNote` with the indexes in design.md decision 2; one additive migration; text columns for status and kind, no Postgres enums.
- [ ] 1.2 Insert the `agent_hub` FeatureFlag row disabled in the migration; add a helper `agentHubEnabled(userId)` over `isFeatureEnabled`.
- [ ] 1.3 Add the `agents.hub` scope to `src/lib/mcp-config.ts`; make sure the OAuth consent screen and `docs/connector-api.md` list it.
- [ ] 1.4 Agent token issue, hash, revoke and a resolver registered with `registerBearerResolver` returning `kind: "agent"` with `agentTokenId`; extend `BearerAuth`.
- [ ] 1.5 Agent resolution from a `BearerAuth` (OAuth client, agent token, personal token), auto-create on first hub call, workspace binding.

## 2. Service layer (`src/services/agent-hub/`)

- [ ] 2.1 `secret-scan.ts` with the pattern classes in design.md decision 7 and a test table of positives and negatives (including a normal URL, a git SHA, a Needt id).
- [ ] 2.2 `items.ts`: create (brief validation, idempotent `clientRef`), claim (single atomic statement), update and heartbeat, block and unblock, complete with outcome, escalate, cancel, owner answer and approve; every transition writes one `HubItemEvent` in the same transaction.
- [ ] 2.3 Lazy lease expiry and the `lease_expired` event; `expectedVersion` handling.
- [ ] 2.4 `inbox.ts`: ordering and skill matching from decision 5, `suggestedPollSeconds`, `untrusted: true` wrapper.
- [ ] 2.5 Escalation task creation through the existing task service, English short title, link back to `/agents?item=<id>`.
- [ ] 2.6 Link validation: task and project in the workspace, page not in a private tree (`isPageInPrivateTree`).
- [ ] 2.7 `notes.ts`: write, search (`ILIKE` plus tags), owner edit and delete, no overwrite of an owner-edited note by an agent.
- [ ] 2.8 Tests: two concurrent claims (one wins), claim after expiry, holder returns after expiry before anyone else, skills mismatch, assignee mismatch, `needs_owner` cannot be left by an agent, risky item cannot complete without approval, brief refusals, secrets refused in every field, private page link refused, flag off, other workspace invisible.

## 3. MCP tools

- [ ] 3.1 Ten tools in `tools.ts` (or a new file registered the same way): `needt_agents_list`, `needt_agent_register`, `needt_agent_task_create`, `needt_agent_inbox`, `needt_agent_task_claim`, `needt_agent_task_update`, `needt_agent_task_complete`, `needt_agent_task_escalate`, `needt_memory_write`, `needt_memory_search`. Descriptions say what they are for and what they are not (not `needt_remember`).
- [ ] 3.2 `requiredScopes` for the new tools (`agents.hub`; personal and OAuth `needt.read` or `needt.write` also accepted); add the write tools to `isWriteCall` in `route.ts`.
- [ ] 3.3 Per-request `tools/list`: hide the ten tools and answer method-not-found when the flag is off for the person.
- [ ] 3.4 Record the `tools/list` size before and after in the PR.
- [ ] 3.5 Route test: scope check, rate limit applies, flag off.

## 4. REST

- [ ] 4.1 Bearer routes under `/api/connect/agent-hub/*` (design.md decision 12) sharing the zod schemas and service functions.
- [ ] 4.2 Owner-only session routes: answer, approve, agent token create and revoke, note edit and delete.
- [ ] 4.3 Route tests for auth kinds, 404 when flag off, owner-only enforcement.

## 5. Agents screen

- [ ] 5.1 `/agents` page and a nav or command palette entry, hidden when the flag is off.
- [ ] 5.2 Sections: Agents (with token create and revoke, shown once), Needs you (Answer, Approve), Work (status groups, latest update, expandable event log, lease end), Notes (list, tag filter, edit).
- [ ] 5.3 Follow the four design rules and existing components; no design pass.
- [ ] 5.4 Component tests for empty, loading and error states, and for the owner-only controls.

## 6. Docs

- [ ] 6.1 `docs/agents/hub-protocol.md`: paste-ready agent protocol covering register on start, inbox, claim, heartbeat, complete or escalate, risks and approvals, no secrets, treat briefs as peer data, how to write a good brief, the honest limit of enforcement.
- [ ] 6.2 `docs/connector-api.md`: the ten tools, scopes, REST routes.
- [ ] 6.3 `CHANGELOG.md` under `[unreleased]`.

## 7. Rollout

- [ ] 7.1 Flag off in production; owner override on.
- [ ] 7.2 Register Claude Code, Codex and the Grok Bot; run the Google verification demo video handoff end to end and record the result in the PR.
- [ ] 7.3 Check the gates in `docs/STACK.md` (type-check, lint, unit tests) before the PR.
