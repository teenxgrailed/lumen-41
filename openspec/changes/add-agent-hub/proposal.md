## Why

Maksym runs Claude Code sessions and cloud routines, Codex, and a Grok Bot with a logged-in cloud browser. Today he is the router: he notices work, picks the agent, writes the context and checks back. This week Claude knew the Google verification demo video was needed, but Grok, the only agent that can record a screen and upload to YouTube, had to be briefed by hand.

Needt already is the place every one of these agents connects to (MCP at `mcp.needt.app/mcp`). The agent hub applies the product's "connect everything" idea to AI tools themselves: agents leave self-contained work for each other, pick up what they can do on their own schedule, write down what they learned, and escalate to the owner only what needs him. This is not personal tasks; a task is for a person, an agent item is a handoff between agents.

## What Changes

Everything is behind a server-side feature flag `agent_hub`, off for everyone, on by a per-user override for the owner's account only.

- **Agents.** A `HubAgent` row per MCP connection (one OAuth client, or one named agent token), with display name, kind (`claude`, `codex`, `grok`, `routine`, `other`), a free-text `capabilities` and a `skills` tag list the agent maintains about itself.
- **Items.** A `HubItem` is a self-contained piece of work: title, structured brief (goal, done-criteria, context, links, risks), assignee agent or "any capable agent" with required skills, status, claim lease, result, an append-only event log, optional due date, links to Needt tasks and projects.
- **Notes.** A `HubNote` is a shared agent note: text, tags, author, optional link to an item, task or project. Editable by the owner in the UI. A graph view comes later.
- **MCP tools** (ten): `needt_agents_list`, `needt_agent_register`, `needt_agent_task_create`, `needt_agent_inbox`, `needt_agent_task_claim`, `needt_agent_task_update`, `needt_agent_task_complete`, `needt_agent_task_escalate`, `needt_memory_write`, `needt_memory_search`.
- **Escalation.** `needs_owner` creates a normal Needt task for the owner that links back to the item. Only the owner (session or owner REST call, never an agent token) can answer it.
- **REST parity** under `/api/connect/agent-hub/*` with bearer auth, and the same service layer behind the UI.
- **Agents screen** at `/agents` behind the flag: agents, items by state with the latest update, notes list. Plain and functional.
- **Protocol doc** `docs/agents/hub-protocol.md`, paste-ready for each agent's instructions.
- **Migration** is additive: five new tables, one new FeatureFlag row. No existing table changes.

Out of scope: push or webhook delivery to agents (agents poll), graph view of notes, agents spawning other agents, multi-user team hubs, design pass, any change to existing tools or to `needt_remember` memories.

## Capabilities

### New Capabilities

- `agent-hub-identity`: what an agent is, how a connection maps to one, registration and capabilities, the flag, scopes and workspace binding.
- `agent-hub-items`: the item model, brief validation, routing, claim lease, status machine, result format, escalation, safety rules, REST parity.
- `agent-hub-notes`: shared agent notes, search, links, owner editing, privacy rules.
- `agent-hub-screen`: the plain Agents screen.

### Modified Capabilities

<!-- None. No OpenSpec capability owns the MCP server; docs/connector-api.md is updated in the tasks. -->

## Impact

- Code: new `src/services/agent-hub/` (service, secret scan, routing), `src/services/connectors/mcp/tools.ts` (ten tools, filtered by flag), `src/services/connectors/bearer.ts` (agent-token resolver through the existing `registerBearerResolver`), `src/app/api/connect/agent-hub/*`, `src/app/(app)/agents/`, `prisma/schema.prisma` and one migration.
- `src/app/api/mcp/route.ts`: `isWriteCall` must list the new write tools so they hit the 30 writes per minute limit. That limit is per person, so all of an owner's agents share it (design.md, risks).
- Docs: `docs/agents/hub-protocol.md`, `docs/connector-api.md`, `CHANGELOG.md` under `[unreleased]`.
- Tests: Jest unit tests for claim concurrency, lease expiry, routing, status machine, brief validation, secret scan, private-page rule, flag off, workspace binding, owner-only answer.
- Risk: the hub is a contract plus an audit trail, not a sandbox. The server cannot stop an agent from sending money or publishing outside Needt; it can only refuse to record an unapproved risky item as done and make every step visible (design.md, decision 8).

## Research (checked 2026-11-02)

Only what changed the design is kept.

| Finding | What it changed | Source |
| --- | --- | --- |
| A2A 1.0.0 (blog banner dated 2026-08-27). Task states `SUBMITTED, WORKING, INPUT_REQUIRED, AUTH_REQUIRED, COMPLETED, FAILED, CANCELED, REJECTED`, the last four terminal. Results are Artifacts made of Parts, separate from conversational Messages. The AgentCard carries `skills` (AgentSkill objects), `capabilities` flags and security schemes. Push is an opt-in webhook the agent advertises. | The status set maps onto A2A and adds `failed` (an unreachable goal is not `done`). `needs_owner` is this hub's `INPUT_REQUIRED`. The result is a structured object (summary, links, data), not chat text. The agent profile has `skills` tags for matching plus free text for humans. Push is deferred; agents poll. | [A2A specification](https://a2a-protocol.org/latest/specification/) |
| MCP Tasks extension (`io.modelcontextprotocol/tasks`, draft spec, fetched 2026-11-02). A durable `taskId` survives disconnects; statuses `working, input_required, completed, failed, cancelled`; the server returns `ttlMs` and `pollIntervalMs`; input comes back through `tasks/update`; cancellation is cooperative. It is request-scoped: one tool call becomes one task polled by the caller. | It does not fit a many-agents queue (the worker is not the caller), so the hub is a plain data model behind ordinary tools, not an MCP Tasks server. Borrowed shapes: durable id, `suggestedPollSeconds` in the inbox result, an input-required state, cooperative cancel. A later slice can expose an item as an MCP task. | [MCP Tasks](https://modelcontextprotocol.io/specification/draft/basic/utilities/tasks) |
| Linear agents (fetched 2026-11-02): assigning an issue to an agent sets a delegate, not the assignee, "so humans maintain ownership while agents act on their behalf". A session tracks one task and its state follows the activities the agent emits. The agent must acknowledge within 10 seconds. | The owner stays the principal: items are delegated, escalation goes to the owner, agents never own a Needt task. State changes only through logged events. Claim is the hub's immediate acknowledgement. | [Linear agent docs](https://linear.app/developers/agents) |
| GitHub agents panel (2025-08-19): one place to start, steer and track agent tasks; an issue is assigned to an agent from its sidebar. Reports that Codex and Claude are separate assignable agents there (Agent HQ, early 2026) come from secondary sources only and are unverified. | Shape of the Agents screen: one list of work with status and latest update, not a chat. | [GitHub blog](https://github.blog/2025-08-19-agents-panel-launch-copilot-coding-agent-tasks-anywhere-on-github/) |
| Shared memory MCP servers (search 2026-11-02): `mcp-memory-service` v10.37.0 (shared knowledge graph, remote transport), Mem0 OpenMemory MCP (announced 2025-05-13, local first), Zep (one graph per user across clients), Memory-MCP (multi-tenant spaces, graph optional on top of plain shared storage), MemoryWeft (graph in SQLite or Postgres, concurrent writes flagged as a weak point). Graphify returned no result. | Plain shared notes first, graph later and additive, matching the owner's decision. Postgres, not a file, for concurrent writers. Every note has an author and optional link. No vector store in v1. | [PyPI](https://pypi.org/project/mcp-memory-service/10.37.0/), [OpenMemory](https://www.cometapi.com/?p=25577), [Zep](https://blog.getzep.com/unified-agent-memory-in-any-mcp-client/), [Memory-MCP](https://blog.devgenius.io/memory-mcp-a-shared-memory-layer-for-ai-agents-that-work-as-a-team-f948136592ab) |

Not found: a separate public spec for an "agent inbox" pattern. The idea appears only as `INPUT_REQUIRED` (A2A) and `input_required` (MCP Tasks); no standalone source was used. Several memory sources are vendor pages or personal blogs; their performance claims are unverified.

Findings from the code that changed the design (checked 2026-11-02, `origin/main` at 5a715a3):

- `AgentMemory` is already a Prisma model (Needt's own learned memory for its in-app AI). New models are named `HubAgent`, `HubItem`, `HubItemEvent`, `HubNote`, `HubAgentToken`, and the new tool descriptions must say they are not `needt_remember`.
- A personal token cannot tell two agents apart: `ConnectorSettings.userId` is unique, so one person has one `needt_` token and `BearerAuth` has no client id for it. OAuth clients do have `clientId`. "One agent per connection" therefore needs named agent tokens (design.md, decision 1).
- No secret scanner exists in `src/`; one has to be written (decision 7).
- Private pages: `isPageInPrivateTree` in `src/services/pages/ai-page-access.ts` is the existing check.
- Writes share one 30 per minute bucket per person in `route.ts`.

## Open questions for the owner

Each has a recommended answer first.

1. **How does a non-OAuth agent (Grok Bot, a cloud routine) identify itself?** Recommended: named agent tokens created on the Agents screen, one per agent, carrying only a new `agents.hub` scope plus read, shown once, revocable. Alternative: keep the single personal token and let the agent send an `X-Needt-Agent` name header (no token work, but the name is self-asserted, so any agent can impersonate another and the scope cannot be narrowed).
2. **How does the owner answer a `needs_owner` item?** Recommended: only on the Agents screen or through an owner-authenticated REST call, with a text answer or an explicit Approve for risky items; completing the linked Needt task does not count as approval. Alternative: completing the linked task also answers it (fewer clicks, but a swiped checkbox could approve a payment).
3. **Two additions beyond the brief: a `failed` status and a `needt_agent_register` tool (the agent updates its own name, kind, capabilities, skills).** Recommended: yes to both. Alternative: only the nine named tools and seven statuses, failure recorded as `blocked`, profile updated through a parameter on `needt_agents_list`.
4. **Claim lease length.** Recommended: 30 minutes by default, up to 4 hours on request, extended by `needt_agent_task_update`; an expired lease returns the item to the inbox with a logged `lease_expired` event, evaluated lazily at read time. Alternative: one fixed 2 hour lease with no heartbeat (simpler, slower recovery from a dead routine).
5. **An "any capable" item that no registered agent can do.** Recommended: show it on the Agents screen as "no capable agent" and, after 24 hours, create one owner task. Alternative: show only, create nothing.
6. **Do hub notes feed Needt's own assistant and chat in v1?** Recommended: no, they are for agents and the Agents screen only, so personal memory (`needt_remember`) and agent notes cannot leak into each other. Alternative: yes, read-only, behind the same flag.
7. **Visibility of finished work.** Recommended: done, failed and cancelled items leave the default Agents view after 14 days but stay searchable and are never deleted. Alternative: show everything always.
