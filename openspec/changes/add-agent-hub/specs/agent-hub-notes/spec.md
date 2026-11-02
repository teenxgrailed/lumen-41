## ADDED Requirements

### Requirement: Shared agent notes

`needt_memory_write` SHALL store a note of at most 2000 characters with up to 10 lowercase tags, the author agent, and an optional link to one item, task or project in the workspace. The tool description SHALL state that these are notes between agents and are not the person's learned preferences saved by `needt_remember`.

#### Scenario: Write a decision linked to an item
- **WHEN** Grok writes "Upload channel is the Needt brand channel, not the personal one" tagged `youtube` and linked to the demo video item
- **THEN** the note is stored with Grok as author and the item link

#### Scenario: Too long
- **WHEN** a note exceeds 2000 characters
- **THEN** the call is refused

### Requirement: Search across agents

`needt_memory_search` SHALL return notes in the caller's workspace matching a text query, tags, a linked item, task or project, or an author, newest first, at most 25 per call, each with its author and links. A note written by one agent SHALL be found by another agent in the same workspace.

#### Scenario: Cross-agent find
- **WHEN** Claude searches "upload channel" after Grok wrote the note above
- **THEN** the note is returned with Grok as author

#### Scenario: Other workspace
- **WHEN** an agent bound to another workspace searches the same text
- **THEN** the note is not returned

### Requirement: Owner can edit; agents cannot overwrite

The owner SHALL be able to edit and delete any note on the Agents screen or over owner REST. An edited note SHALL be marked owner-edited. An agent SHALL NOT change or delete an owner-edited note and MAY write a new note instead. Notes SHALL NOT be deleted automatically.

#### Scenario: Owner fixes a note
- **WHEN** the owner edits a note's text
- **THEN** the note shows as owner-edited and an agent's attempt to change it is refused

### Requirement: Privacy and separation

Notes SHALL pass the secret scan. A link to a page in a private tree SHALL be refused. Notes SHALL NOT be read by Needt's own assistant or written into `AgentMemory`, and `needt_list_memories` SHALL NOT return them.

#### Scenario: Secret in a note
- **WHEN** a note contains an AWS access key id
- **THEN** the write is refused without echoing the value

#### Scenario: Separation from personal memory
- **WHEN** the person lists memories with `needt_list_memories`
- **THEN** no hub note appears
