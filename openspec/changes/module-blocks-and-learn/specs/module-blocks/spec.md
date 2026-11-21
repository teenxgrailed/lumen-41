## ADDED Requirements

### Requirement: Modules are assembled only from registry blocks

A module SHALL contain only blocks registered in the block registry. The registry SHALL define, per block type, a Zod props schema, the allowed actions and the required scopes. The system SHALL NOT execute generated code, HTML or scripts from a module.

#### Scenario: Unknown block type
- **WHEN** a module spec contains an element of type `iframe`
- **THEN** validation fails with code `unknown_block` and the module is not stored

#### Scenario: Props out of schema
- **WHEN** a `list` element has a prop its schema does not declare or a value of the wrong type
- **THEN** validation fails with the element path and code `invalid_props`

#### Scenario: Reserved block
- **WHEN** a module contains a `voice` block
- **THEN** validation fails with code `block_disabled` and no voice UI exists

### Requirement: Registry blocks at launch

The registry SHALL provide `list`, `table`, `cards`, `chart`, `form`, `timer`, `chat` and `calendarSlot`, and the Learn blocks `flashcardStack`, `exercise`, `lessonSummary` and `mascot`.

#### Scenario: Catalog listing
- **WHEN** a client calls `block_list`
- **THEN** it receives every enabled block with its JSON Schema for props, its allowed actions and its required scopes

### Requirement: Module document shape

A module SHALL be a JSON document with `id`, `kind` equal to `needt.module`, `schemaVersion`, `version`, `title`, `scopes`, `collections` and `layout`. `layout` SHALL be a flat spec `{ root, elements }` where each element has `type`, `props`, and optionally `children`, `dataSource`, `on` and `bindings`.

#### Scenario: Wrong kind
- **WHEN** a document has `kind` other than `needt.module`
- **THEN** it is rejected with code `invalid_kind`

#### Scenario: Dangling child
- **WHEN** an element lists a child id that is not in `elements`
- **THEN** validation fails in the referential pass with code `missing_element`

### Requirement: Typed custom collections

A module MAY declare collections with typed fields. Records SHALL be validated against the declared fields on every write.

#### Scenario: Wrong field type
- **WHEN** a write puts a string into a `datetime` field
- **THEN** the write is refused with code `invalid_field` and nothing is stored

### Requirement: Data sources are structured queries

A `dataSource` SHALL be `{ collection, filter, sort, limit }` using a closed operator set (`eq`, `ne`, `lt`, `lte`, `gt`, `gte`, `in`, `contains`). The server SHALL compile it to Prisma with the viewer's user and workspace forced into the filter. The system SHALL NOT accept raw SQL.

#### Scenario: Another person's data
- **WHEN** a module owned by A is opened by B
- **THEN** every query runs with B's identity and scopes and returns only what B may read

#### Scenario: Raw SQL attempt
- **WHEN** a dataSource carries a `sql` or unknown operator key
- **THEN** validation fails with code `invalid_query`

#### Scenario: Query size
- **WHEN** a dataSource asks for `limit` above 200
- **THEN** validation fails in the limits pass with code `limit_exceeded`

### Requirement: AI output is validated in three passes

Module JSON produced by the AI SHALL be validated by (1) Zod schema, (2) referential checks (collections, fields, actions and element ids exist; the tree is acyclic) and (3) scopes and limits (at most 60 blocks, depth 6, 64 KB). On failure the model SHALL receive structured errors and MAY retry at most twice. Nothing SHALL be persisted until a document is valid.

#### Scenario: Retry succeeds
- **WHEN** the first output fails pass 2 and the second passes
- **THEN** exactly one module version is stored

#### Scenario: Retries exhausted
- **WHEN** the third output still fails
- **THEN** the request returns the structured errors and no module or version row exists

### Requirement: Edits are versioned patches

Edits SHALL be JSON-Patch operations against a `baseVersion`. Every accepted edit SHALL store a new version, and the person SHALL be able to undo it.

#### Scenario: Stale base
- **WHEN** a patch carries `baseVersion` 3 and the module is at 5
- **THEN** the call returns 409 with the current document and changes nothing

#### Scenario: Undo
- **WHEN** the person undoes the last edit
- **THEN** a new version equal to the previous content is stored and history is kept

### Requirement: Edits by the AI go through a preview

When the AI proposes a change to an existing module, the person SHALL see a diff and a preview and SHALL accept it before it is stored. The person MAY also edit block props directly in a form generated from the block's Zod schema, and MAY clone a module or start from a template (a module with no records).

#### Scenario: Proposal not accepted
- **WHEN** the person dismisses a proposed diff
- **THEN** the module version is unchanged

### Requirement: Permissions follow the caller

The AI and every API client SHALL act with the caller's own rights. A module's `scopes` SHALL NOT exceed its owner's scopes. Creating or changing modules SHALL require `modules:write`, separate from using a module. Writes made by an agent SHALL appear in the activity log.

#### Scenario: Scope escalation
- **WHEN** a module declares a scope its owner does not hold
- **THEN** validation fails with code `scope_exceeds_owner`

#### Scenario: Read-only token
- **WHEN** a token with `needt.read` calls `module_create`
- **THEN** the call returns 403 `insufficient_scope`

### Requirement: Reachable from outside

Every module operation SHALL be available through MCP tools, the REST mirror under the connector API, and Connectors: `module_list`, `module_get`, `module_create`, `module_update`, `module_delete`, `module_validate` (dry run), `block_list`, `block_get_data` and `block_invoke_action`.

#### Scenario: Dry run
- **WHEN** a client calls `module_validate` with a spec
- **THEN** it receives the three-pass result and nothing is stored

#### Scenario: REST mirror
- **WHEN** a script calls the REST equivalent of `module_get` with a personal token
- **THEN** it gets the same document and the same scope checks as the MCP tool

### Requirement: Rendering in MCP clients

Module tools SHALL set `_meta.ui.resourceUri` to `ui://needt/module/{id}` and serve it as `text/html;profile=mcp-app`. Clients without MCP Apps support SHALL receive text and the JSON spec.

#### Scenario: Client without UI support
- **WHEN** a client that ignores `_meta.ui` calls `module_get`
- **THEN** the result is complete as text plus JSON with no loss of data

### Requirement: Generic module building is limited in v1

In v1 the registry SHALL be internal, MCP and REST SHALL be read-only for modules other than the internal Learn module, and user-built modules SHALL be released later.

#### Scenario: Write attempt in v1
- **WHEN** a client calls `module_create` for a non-internal module
- **THEN** the call returns 403 `modules_write_disabled`

### Requirement: Design rules apply to every block

Block chrome SHALL use the 13px and 12px interface scale, greys as one ink at ladder alphas, a hairline-first elevation, and accent only as text or a 12% or 24% wash, never as a solid fill on a button or surface. Solid accent MAY be used on marks.

#### Scenario: Accent on a button
- **WHEN** a block renders a primary button
- **THEN** its fill is not the solid accent colour
