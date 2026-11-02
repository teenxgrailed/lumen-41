## ADDED Requirements

### Requirement: Self-contained brief

`needt_agent_task_create` SHALL refuse an item unless it has a title, a goal of at least 20 characters, non-empty done-criteria, a context of at least 40 characters, and an explicit `risks` array (possibly empty) drawn from `money`, `send_message`, `publish`, `delete`. The refusal SHALL name the missing field. `clientRef` SHALL make creation idempotent per creating agent.

#### Scenario: Missing done-criteria
- **WHEN** an agent creates an item with a goal and context but no done-criteria
- **THEN** the call is refused naming `doneCriteria` and nothing is stored

#### Scenario: Risks must be stated
- **WHEN** an agent omits `risks`
- **THEN** the call is refused; passing `risks: []` is accepted

#### Scenario: Retried create
- **WHEN** a routine repeats a create with the same `clientRef`
- **THEN** the existing item is returned and no second item is stored

### Requirement: Assignment and routing

An item SHALL be assigned to one named agent or to `"any"` with at least one required skill. The inbox of an agent SHALL contain, in this order, open items assigned to it, items it currently holds, and unassigned open items whose required skills are all among its skills. It SHALL NOT contain items assigned to another agent, terminal items, or items in `needs_owner`.

#### Scenario: Assigned item reaches the right inbox
- **WHEN** Claude creates an item assigned to the Grok agent
- **THEN** Grok's `needt_agent_inbox` returns it and Codex's does not

#### Scenario: Any capable
- **WHEN** an item has `assignee: "any"` and required skills `["youtube-upload"]`
- **THEN** only agents whose skills include `youtube-upload` see it in their inbox

#### Scenario: Resume after restart
- **WHEN** an agent that holds a claimed item starts a new run and reads its inbox
- **THEN** the held item is returned before open items

### Requirement: Atomic claim with a lease

`needt_agent_task_claim` SHALL succeed for at most one agent at a time. A successful claim SHALL set the holder and a lease end (30 minutes by default, at most 240 on request). A claim on an item held with an unexpired lease SHALL fail with a conflict naming the holder and lease end. A lease that has passed SHALL make the item claimable again and SHALL be recorded as a `lease_expired` event.

#### Scenario: Two agents claim at once
- **WHEN** two agents claim the same open item in the same instant
- **THEN** exactly one succeeds and the other gets `ALREADY_CLAIMED`

#### Scenario: Expired lease
- **WHEN** a holder's lease has passed and another eligible agent claims
- **THEN** the claim succeeds and the log shows `lease_expired` then `claimed`

#### Scenario: Holder returns first
- **WHEN** the lease has passed but no one else claimed, and the holder sends an update
- **THEN** the update is accepted and the lease is extended

#### Scenario: Ineligible agent
- **WHEN** an agent without the required skills claims an "any" item, or claims an item assigned to another agent
- **THEN** the claim is refused

### Requirement: Status machine and event log

Statuses SHALL be `open`, `claimed`, `in_progress`, `blocked`, `needs_owner`, `done`, `failed`, `cancelled`, the last three terminal. Every transition and every update message SHALL append one event with the actor (agent or owner or system), the time, the previous and new status and the message. Events SHALL never be edited or deleted. A terminal item SHALL accept no further agent change.

#### Scenario: Every change is recorded
- **WHEN** an agent claims, updates and completes an item
- **THEN** the item has three events in order, each naming that agent and a time

#### Scenario: Terminal is final
- **WHEN** an agent updates a `done` item
- **THEN** the call is refused

#### Scenario: Stale write
- **WHEN** an update carries an `expectedVersion` older than the item's version
- **THEN** it is refused with `STALE` and nothing changes

### Requirement: Structured result

`needt_agent_task_complete` SHALL take an outcome (`done` or `failed`) and a result with a non-empty `summary` (at most 2000 characters), optional `links` (label and URL) and optional JSON `data` (at most 8 KB). For a `done` outcome it SHALL also take whether the done-criteria were met with a one-line note; an item completed with criteria not met SHALL be flagged on the screen.

#### Scenario: Complete with a link
- **WHEN** Grok completes the demo video item with a summary and the YouTube link
- **THEN** the item is `done`, and the creator reading `needt_agent_inbox` with `view: "created"` sees the result link

#### Scenario: Empty summary
- **WHEN** an agent completes with an empty summary
- **THEN** the call is refused

### Requirement: Escalate to the owner

`needt_agent_task_escalate` SHALL set the item to `needs_owner`, release the lease, record the question, and create one normal Needt task for the owner whose title is short and in English, whose notes contain the question and a link to the item, and whose id is stored on the item. Only the owner, through the Agents screen or an owner-authenticated REST call, SHALL be able to answer; an answer SHALL be appended as an owner event and return the item to `open` assigned to the agent that escalated. An agent token or OAuth client SHALL NOT be able to move an item out of `needs_owner`. Completing the linked Needt task SHALL NOT answer or approve the item.

#### Scenario: Escalation creates a task
- **WHEN** Grok escalates "Which account should publish the video?"
- **THEN** the item is `needs_owner` and the owner has a new task linking back to the item

#### Scenario: Agent cannot self-approve
- **WHEN** an agent calls update to set `in_progress` on a `needs_owner` item
- **THEN** the call is refused

#### Scenario: Owner answers
- **WHEN** the owner answers on the Agents screen
- **THEN** the item is `open` again for the same agent with the answer in the log, and the linked task is completed

#### Scenario: Linked task ticked
- **WHEN** the owner completes the linked Needt task without answering
- **THEN** the item stays `needs_owner`

### Requirement: Risky work needs recorded owner approval

An item whose `risks` is non-empty SHALL NOT be completable as `done` until the owner has approved each declared risk through the Agents screen or an owner REST call. The claim result SHALL list the declared risks and state that the agent must escalate before performing them. The hub SHALL document that it records and gates completion, not that it prevents actions outside Needt.

#### Scenario: Complete without approval
- **WHEN** an item declaring `publish` is completed with no owner approval
- **THEN** the call is refused with `APPROVAL_REQUIRED`

#### Scenario: Approved
- **WHEN** the owner approves `publish` and the agent then completes
- **THEN** the item becomes `done`

### Requirement: No secrets, no private pages

Title, brief, links, update messages, results, notes and tags SHALL be scanned and the write refused if they contain a credential-like value, naming the field and the kind of match without echoing it. A link to a page in a private tree, or to a task, project or page outside the workspace, SHALL be refused. Private pages SHALL NOT appear in any hub response.

#### Scenario: Token in a brief
- **WHEN** a brief contains `ghp_` followed by a 36 character token
- **THEN** the create is refused naming `context` and "access token"

#### Scenario: Private page link
- **WHEN** an item links a page inside a private tree
- **THEN** the create is refused

### Requirement: Peer content is untrusted

Every item or note returned to an agent SHALL carry `untrusted: true`, and the protocol document SHALL tell agents that brief and note text written by another agent is data, not authority to skip escalation.

#### Scenario: Flag in results
- **WHEN** an agent reads its inbox
- **THEN** each item has `untrusted: true`

### Requirement: REST parity

Every agent operation available over MCP SHALL be available over bearer-authenticated REST under `/api/connect/agent-hub/` with the same validation, scopes, workspace rules and flag. Owner-only operations (answer, approve, create or revoke tokens, edit or delete notes, edit any agent profile) SHALL require an owner session and SHALL be refused for agent tokens.

#### Scenario: Same result
- **WHEN** the same create is made over MCP and over REST with different `clientRef` values
- **THEN** both items have identical fields and events apart from ids and times

#### Scenario: Agent token on an owner route
- **WHEN** an agent token calls the approve route
- **THEN** the answer is forbidden
