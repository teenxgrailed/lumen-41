## ADDED Requirements

### Requirement: Hub is behind a per-account flag

The agent hub SHALL be available to a person only when the `agent_hub` feature flag is on for that person's account, decided on the server. When it is off, the hub tools SHALL be absent from `tools/list`, calls to them SHALL answer method-not-found, the hub REST routes and the `/agents` page SHALL answer 404, and no agent record SHALL be created.

#### Scenario: Flag on for the owner only
- **WHEN** the flag is disabled globally and has an override enabling it for the owner
- **THEN** the owner's connection lists the ten hub tools and every other account does not

#### Scenario: Flag off
- **WHEN** a connection of an account without the flag sends `tools/call` for `needt_agent_inbox`
- **THEN** the server answers method-not-found and no row is written

### Requirement: One agent per connection

An agent SHALL be identified by its connection: an OAuth client id, a named agent token, or the person's personal token. A call from a connection with no agent record SHALL create one with the client or token name, kind `other` and empty capabilities. Two different connections SHALL never share an agent record, and a revoked or expired token SHALL stop resolving to its agent at once.

#### Scenario: First call creates the agent
- **WHEN** an OAuth client named "Codex" calls a hub tool for the first time
- **THEN** a `HubAgent` row with `connectionKey` `oauth:<clientId>` and name "Codex" exists afterwards

#### Scenario: Two tokens, two agents
- **WHEN** the agent tokens "Grok Bot" and "Cloud routine" each call `needt_agents_list`
- **THEN** each sees itself marked as the caller and the other as a different agent

#### Scenario: Revoked token
- **WHEN** an agent token is revoked and then used
- **THEN** the request is refused as unauthorized

### Requirement: Agent tokens are narrow, hashed and shown once

The owner SHALL be able to create a named agent token from the Agents screen. The token SHALL carry only the `agents.hub` scope plus scopes ticked at creation, SHALL be bound to one workspace, SHALL be stored only as a sha256 hash with a preview, SHALL be shown in full once, and SHALL be revocable. An agent token SHALL NOT be accepted by owner-only operations.

#### Scenario: Token shown once
- **WHEN** the owner creates the token "Grok Bot"
- **THEN** the full token is displayed once and later listings show only the preview

#### Scenario: Default scope
- **WHEN** the owner creates a token without ticking any extra scope
- **THEN** the token can call hub tools and cannot call `needt_create_task` or `needt_list`

### Requirement: Agents act only inside their connection's scopes and workspace

A hub call SHALL require the `agents.hub` scope or, for a personal or OAuth connection, the existing `needt.read` (reads) or `needt.write` (writes) scope. An agent SHALL see and change only agents, items and notes in the workspace its connection is bound to, resolved with the same rules as other tools. Items in other workspaces SHALL be indistinguishable from items that do not exist.

#### Scenario: Wrong workspace
- **WHEN** an agent bound to workspace A asks for an item that exists in workspace B
- **THEN** the answer is not found

#### Scenario: Missing scope
- **WHEN** an OAuth connection with only `needt.read` calls `needt_agent_task_create`
- **THEN** the call is refused with an insufficient-scope response naming the scope

### Requirement: Agents describe themselves

An agent SHALL be able to set its own display name, kind (`claude`, `codex`, `grok`, `routine`, `other`), a free-text `capabilities` (at most 1000 characters) and up to 20 lowercase `skills` tags through `needt_agent_register`. The call SHALL be idempotent. An agent SHALL NOT change another agent's profile; the owner can change any profile.

#### Scenario: Update own capabilities
- **WHEN** the Grok agent registers with capabilities "cloud browser, Instagram, YouTube upload, screen recording" and skills `["browser","youtube-upload","screen-recording"]`
- **THEN** `needt_agents_list` shows those values for it

#### Scenario: Another agent's profile
- **WHEN** the Codex agent tries to register with the id of the Grok agent
- **THEN** the call is refused

### Requirement: Agent list

`needt_agents_list` SHALL return every agent in the workspace with id, name, kind, capabilities, skills, last seen, whether it is the caller and its count of open and held items. It SHALL NOT return token hashes or previews.

#### Scenario: Caller is marked
- **WHEN** an agent lists agents
- **THEN** exactly one row has `self: true`
