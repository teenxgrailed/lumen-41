## Context

- MCP server: `src/app/api/mcp/route.ts` plus `src/services/connectors/mcp/`. Stateless Streamable HTTP, hand-written JSON-RPC. Every request carries a bearer token. `authenticateBearer` (`src/services/connectors/bearer.ts`) returns `BearerAuth { userId, scopes, kind: "personal" | "oauth", workspaceId?, clientId? }`; other token kinds plug in through `registerBearerResolver`. The route checks Origin, per-IP and per-person limits (120 calls, 30 writes per minute), then `requiredScopes(tool, args)`.
- Personal token: `ConnectorSettings.userId` is unique, so a person has exactly one `needt_` token, with every scope except admin, no workspace, no client id. OAuth tokens carry the consented scopes, the bound `workspaceId` and `clientId`.
- Workspace: every tool takes an optional `workspaceId`; `workspaceAccess` / `writeAccess` resolve it against the token's bound workspace and the member role.
- Private pages: `isPageInPrivateTree` / `withoutPrivateTrees` in `src/services/pages/ai-page-access.ts`; MCP reads pages as an AI actor.
- Memory: `AgentMemory` (Prisma) and `needt_remember`, `needt_list_memories`, `needt_update_memory`, `needt_forget_memory` are the person's learned preferences for Needt's own AI, behind "Let Needt learn about me".
- Flags: `FeatureFlag` rows with `enabled`, `rolloutPercentage` and per-user `overrides`; `isFeatureEnabled(key, userId)` in `src/lib/feature-flags.ts`. A flag that is globally off with one override row is exactly "on for his account only".
- Worker: BullMQ in `src/worker/`, not needed here (decision 5).

## Goals

- Claude Code can hand Grok a self-contained job; Grok finds it on its next routine run, finishes it or asks the owner, and the owner is involved only on `needs_owner`.
- Any agent can leave a note another agent finds later.
- Everything an agent can do is also available over REST and visible on a plain screen.

## Non-Goals

- Push delivery, agent-to-agent chat, agents creating agents, team hubs, a graph view, a vector index, any design polish.
- Enforcing behaviour outside Needt (decision 8).

## Decisions

### 1. Agent identity is the connection

`HubAgent.connectionKey` is `oauth:<clientId>` or `token:<hubAgentTokenId>`, unique per user. `BearerAuth` gains an optional `agentTokenId`. Because a person has only one personal token and no client id on it, a second kind of bearer is added: **named agent tokens** (`HubAgentToken`: `needt_agent_` prefix, sha256 hash only stored, shown once, preview, expiry, revoked flag, `lastUsedAt`, scopes, bound `workspaceId`). A resolver registered with `registerBearerResolver` turns one into a `BearerAuth` of `kind: "agent"`, with scopes limited to the new `agents.hub` scope plus whatever the owner ticked at creation (default: none else). `agents.hub` is added to `MCP_SCOPES`; existing personal and OAuth behaviour is unchanged, and the OAuth consent screen offers it as a normal scope.

A call from a connection without a `HubAgent` row creates one (name from the OAuth client name or the token name, kind `other`, empty capabilities). A personal `needt_` token is accepted too and maps to one agent with `connectionKey = personal`, so Claude Code with the existing token works on day one; the Agents screen suggests replacing it with a named token.

Why not an `X-Needt-Agent` header on the personal token: the name would be self-asserted and could not be revoked or scoped per agent (open question 1).

An agent sees and acts only inside its connection's workspace (the OAuth-bound or token-bound `workspaceId`; for a personal token, the `workspaceId` argument resolved like any tool). An item has one `workspaceId` and is invisible to a connection bound elsewhere.

### 2. Data model (additive)

```
HubAgent        id, userId, workspaceId, connectionKey (unique with userId), name, kind,
                capabilities text (<= 1000), skills String[] (<= 20 lowercase tags),
                lastSeenAt, disabledAt?, createdAt, updatedAt
HubAgentToken   id, agentId, tokenHash unique, tokenPreview, scopes String[],
                workspaceId, expiresAt?, revokedAt?, lastUsedAt?, createdAt
HubItem         id, userId, workspaceId, title (<= 200),
                goal, doneCriteria, context (text), links Json, risks String[],
                status, assigneeAgentId?, requiredSkills String[],
                creatorKind ("agent" | "owner"), creatorAgentId?,
                claimedByAgentId?, leaseExpiresAt?, due?, result Json?,
                taskId?, projectId?, escalationTaskId?, clientRef?,
                version Int, createdAt, updatedAt, closedAt?
                unique (userId, creatorAgentId, clientRef) when clientRef is set
HubItemEvent    id, itemId, at, actorKind ("agent" | "owner" | "system"), actorAgentId?,
                type, fromStatus?, toStatus?, message (<= 2000), data Json?
HubNote         id, userId, workspaceId, text (<= 2000), tags String[], authorKind,
                authorAgentId?, itemId?, taskId?, projectId?, ownerEdited Boolean,
                createdAt, updatedAt
```

Names avoid the existing `AgentMemory`. Indexes: `HubItem (workspaceId, status, assigneeAgentId)`, `HubItem (status, leaseExpiresAt)`, `HubItemEvent (itemId, at)`, `HubNote (workspaceId, createdAt)` and a GIN index on `tags`. Note search is `ILIKE` on `text` plus tag filter in v1; a `tsvector` column is a later migration. `HubItemEvent` rows are never updated or deleted, which is what "every change is recorded with agent and time" means. The structured brief is stored as columns, not a blob, so required fields are checked in the database layer too.

### 3. Brief, validated at create

`needt_agent_task_create` input: `title`, `goal`, `doneCriteria`, `context`, `links[]` (`{label, url}` or a Needt reference `{type: task|project|page, id}`), `risks[]` (subset of `money`, `send_message`, `publish`, `delete`; an empty array is an explicit "none"), `assignee` (agent id or name, or `"any"`), `requiredSkills[]` (needed when `assignee` is `"any"`), optional `due`, `taskId`, `projectId`, `clientRef`.

Refused with a message that says what to add: empty or under 20 character `goal`; empty `doneCriteria`; `context` under 40 characters; `risks` missing (not the same as empty); `assignee: "any"` with no `requiredSkills`; an unknown assignee; a link to a private page or to something outside the workspace; a secret in any field (decision 7). `clientRef` makes create idempotent per creator, which a retrying routine needs.

### 4. Status machine and the claim lease

```
open ──claim──> claimed ──update──> in_progress ──complete──> done
  ^                │  \                 │  \──fail──> failed
  │ lease expiry   │   \──block──> blocked ──unblock──> in_progress
  │ or release     │                    
  └────────────────┘     any non-terminal ──escalate──> needs_owner ──owner answer──> open
                         any non-terminal ──cancel (creator or owner)──> cancelled
```

Terminal: `done`, `failed`, `cancelled`. `blocked` means waiting on something other than the owner (another item, an external wait) and carries `blockedOn` text. `needs_owner` means waiting on the person. Only the owner can leave `needs_owner`; the answer is appended as an owner event and the item returns to `open`, still assigned to the agent that escalated, so its inbox picks it up with the answer in the log. `claimed` and `in_progress` are one lease-holding phase; the split exists so the screen can show "picked up" versus "working".

Claim is one atomic statement: `UPDATE HubItem SET status='claimed', claimedByAgentId=$a, leaseExpiresAt=now()+$ttl, version=version+1 WHERE id=$id AND workspaceId=$w AND (status='open' OR (status IN ('claimed','in_progress') AND leaseExpiresAt < now())) AND (assigneeAgentId IS NULL OR assigneeAgentId=$a)`. Zero rows updated means someone else holds it; the tool answers `409 ALREADY_CLAIMED` with the holder's name and lease end. A claim on an "any" item also checks that the claimer's `skills` contain all `requiredSkills`.

Lease: 30 minutes by default, `leaseMinutes` up to 240 on claim; `needt_agent_task_update` with `heartbeat: true` or any update extends it. Expiry is lazy: any read treats `claimed|in_progress` with a past `leaseExpiresAt` as claimable, and the next claim, or the next list that touches the row, writes a `lease_expired` system event. No cron is needed. Update, complete, escalate and fail by the holder require `leaseExpiresAt > now()` or no one else holding the item (an expired holder that returns first may continue); otherwise `409 LEASE_LOST`. All writes carry `expectedVersion` optionally; a mismatch is `409 STALE`.

### 5. Routing and the inbox

`needt_agent_inbox` returns, for the calling agent, in this order: items assigned to it in `open` (including after an owner answer), items it holds that are still `claimed|in_progress` (so a restarted routine resumes), then unassigned `open` items whose `requiredSkills` are all in its `skills`. Each row has id, title, status, the whole brief, latest event and `suggestedPollSeconds`. Default limit 10, hard cap 25. It is a read tool, it does not claim. With `view: "created"` it instead returns the items the caller created, newest change first, so a creator finds results, blocks and escalations without a separate tool. Skills match exactly after lowercasing; `capabilities` text is only for humans and for the creator reading `needt_agents_list`. Polling, not push: a webhook per agent (A2A push notifications) can be added later without changing the data model; the existing `ConnectorSettings.webhookUrl` is not reused.

### 6. Result format

`needt_agent_task_complete` takes `result: { summary (required, <= 2000), links[] ({label, url}), data? (JSON, <= 8 KB) }` and refuses an empty `summary`. A `done` item with `doneCriteria` also takes `criteriaMet: boolean` and a one-line `criteriaNote`; `false` is allowed but is stored so the screen can flag it. `needt_agent_task_fail` is folded into complete as `outcome: "done" | "failed"` so there is one terminal tool for the holder. Result is shaped like an A2A artifact (typed parts), not like a chat message.

### 7. No secrets in items and notes

No scanner exists in `src/`. `src/services/agent-hub/secret-scan.ts` is added: rejects PEM private key blocks, `needt_` and `needt_agent_` tokens, AWS access key ids, GitHub, Stripe, Slack and OpenAI style key prefixes, JWT triples, `Authorization: Bearer <20+ chars>` headers, URLs with `user:pass@`, and `password|secret|token|api[_-]?key` followed by `=` or `:` and a 12+ character value. Runs on title, brief, context, update messages, result, note text and tags. The error names the field and the pattern class, never echoes the match. It is a guard against accidents, not a security boundary, and the protocol doc says so: credentials for an agent live in its own environment, never in Needt.

### 8. Money, sending, publishing, deleting

The brief declares `risks`. The enforceable parts, all server side:

- `needs_owner` can be left only by the owner (session or owner REST), never by an agent token or an OAuth client. `needt_agent_task_update` cannot set `in_progress` from `needs_owner`.
- An item with non-empty `risks` carries `approvals: Json` (per risk: approvedAt, by owner, optional note), written only by the owner action "Approve". `needt_agent_task_complete` on such an item refuses with `409 APPROVAL_REQUIRED` unless every declared risk is approved, and the claim result lists the risks and says "escalate with `needt_agent_task_escalate` before doing any of these".
- Escalate creates the owner task (decision 9) and logs it.

What the server cannot do: stop Grok from clicking Buy. The hub makes the rule explicit in the agent's brief, refuses to record the work finished without an owner approval, and leaves an event trail. `docs/agents/hub-protocol.md` states this in the first paragraph.

### 9. Escalation creates a normal Needt task

`needt_agent_task_escalate { id, question, options?[], risk? }`: sets `needs_owner`, releases the lease, writes the event, and creates a task through the same service as `needt_create_task` (title in English, short, from the item title, for example "Decide: <title>"; notes carry the question and a link `/agents?item=<id>`), stored in `escalationTaskId`. Title, due and workspace follow the person's task rules. The task has no authority: completing it neither answers nor approves (open question 2). If the owner answers on the screen, the linked task is completed by the service and the event says so.

### 10. Notes versus personal memory

`needt_memory_write { text, tags[], itemId?, taskId?, projectId? }` and `needt_memory_search { query?, tags[], itemId?, authorAgent?, limit }` operate on `HubNote` only. Their descriptions say: team notes between agents, not about the person, not `needt_remember`. Writes with a `taskId` or `projectId` check the object is in the workspace; links to a page are refused when it is in a private tree. Search results never include pages' contents, only note rows. Notes do not enter Needt's own AI prompts in v1 (open question 6). Owner edits set `ownerEdited` and an event-like `updatedAt`; an agent cannot overwrite an owner-edited note, it can write a new one (the old text stays).

### 11. Flag and tool exposure

Flag key `agent_hub` (`FeatureFlag` row, `enabled=false`, one override for the owner). When off for the person: the ten tools are absent from `tools/list`, calls to them answer method-not-found, `/api/connect/agent-hub/*` and `/agents` answer 404, no agent rows are auto-created. `tools/list` is built per request after authentication, so it can depend on the person. The tool list grows by ten; the PR records the `tools/list` byte size before and after.

### 12. REST parity

Service functions in `src/services/agent-hub/` are the only code that touches the tables. MCP tools and routes are thin adapters. Bearer routes: `/api/connect/agent-hub/agents`, `/items` (list, create), `/items/[id]` (get, update), `/items/[id]/claim|complete|escalate|cancel`, `/inbox`, `/notes` (list, search, create), `/notes/[id]` (update, delete by owner). Owner-only routes (session auth, owner role): `/items/[id]/answer`, `/items/[id]/approve`, `/agents/[id]/tokens` (create, revoke), note edit and delete. Same scope and workspace checks as MCP via the existing connector helpers, same zod schemas.

### 13. Screen

`/agents` under `src/app/(app)/agents/`, linked from settings or the command palette while flagged. Four plain sections: Agents (name, kind, capabilities, last seen, tokens), Needs you (needs_owner items with the question and Answer / Approve), Work (open, claimed, blocked, done, with latest update and the full event log on expand), Notes (list, tag filter, edit). Existing components only, the four design rules (one text colour at ladder alphas, 13 and 12 px, accent only on marks, one form-row geometry), no count above rows already visible. The design pass comes later.

## Risks and trade-offs

- **Shared write bucket.** 30 writes per minute per person is shared by all agents plus the owner's own AI calls. A busy day with five agents can hit it. Mitigation: inbox and search are reads; claim and heartbeat count as writes; if it bites, key the limiter by `(userId, agentId)` for hub tools. Not changed now.
- **Prompt injection through briefs and notes.** An item written by one agent is read by another. Every inbox and search result is wrapped with a fixed field `untrusted: true` and the protocol doc tells agents to treat brief text as data from a peer, never as authority to skip escalation. The server's only hard guarantees are decision 8.
- **Agent identity of a personal token.** Several agents sharing one personal token appear as one agent. The Agents screen shows a warning on that row.
- **Lazy lease expiry.** A dead holder keeps showing as "working" until its lease passes; the screen shows the lease end.
- **Table growth.** Events are append-only and kept; notes and items are never auto-deleted.

## Migration Plan

One additive migration: five tables, text columns for status and kind (no Postgres enums, so later values need no migration), one `FeatureFlag` row inserted disabled. No backfill, no change to existing tables. Roll back by turning the flag off; tables stay.

## Rollout

Flag off for everyone, override on for the owner. Seed three agents for him from the Agents screen (Claude Code via the personal token, Codex, Grok Bot with a named token). Validate with the Google demo video handoff. Widening to other accounts is a separate decision and needs the multi-user checks listed in non-goals.
