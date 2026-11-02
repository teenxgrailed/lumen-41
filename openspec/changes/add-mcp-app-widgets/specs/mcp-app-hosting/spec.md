## ADDED Requirements

### Requirement: Advertise and serve UI resources

When the `mcp-app-widgets` flag is on, the MCP server SHALL declare the `io.modelcontextprotocol/ui` extension and a `resources` capability in its `initialize` result, SHALL answer `resources/list` with the Needt UI resources, and SHALL answer `resources/read` for a listed `ui://needt/` URI with one content item whose `mimeType` is `text/html;profile=mcp-app` and whose `text` is a complete HTML5 document.

#### Scenario: Client lists resources
- **WHEN** an authenticated client sends `resources/list` and the flag is on
- **THEN** the result contains `ui://needt/today.html`, `ui://needt/tasks.html` and `ui://needt/project.html`, each with mime type `text/html;profile=mcp-app`

#### Scenario: Client reads a resource
- **WHEN** an authenticated client sends `resources/read` for `ui://needt/tasks.html`
- **THEN** the result has one content item with the same URI, mime type `text/html;profile=mcp-app` and an HTML document in `text`

#### Scenario: Unknown resource
- **WHEN** a client reads a `ui://` URI that is not in the registry
- **THEN** the server answers with a JSON-RPC error and returns no HTML

#### Scenario: Flag off
- **WHEN** the flag is off
- **THEN** `initialize` has no `resources` capability and no UI extension entry, `resources/list` and `resources/read` answer method-not-found, and `tools/list` carries no `_meta.ui`

#### Scenario: Unauthenticated request
- **WHEN** a request without a valid bearer token asks for `resources/read`
- **THEN** the server answers 401 with the same challenge as for any other method

### Requirement: Link tools to UI resources with the current field

A tool that has a view SHALL carry `_meta.ui.resourceUri` in `tools/list`, naming a resource in the registry. The server SHALL NOT emit the deprecated flat `_meta["ui/resourceUri"]` key.

#### Scenario: View tool is linked
- **WHEN** a client calls `tools/list` with the flag on
- **THEN** `needt_view_today`, `needt_view_tasks` and `needt_view_project` each carry `_meta.ui.resourceUri` pointing at their own resource

#### Scenario: Existing tools untouched
- **WHEN** a client calls `tools/list`
- **THEN** every tool that existed before this change has the same name, description, input schema and annotations as before and carries no `_meta.ui`

### Requirement: Plain tool results stay complete

Every tool that has a view SHALL return the full data as JSON text in `content`, identical in meaning to what a client without MCP Apps support needs. No tool SHALL depend on its view being rendered.

#### Scenario: Client without MCP Apps
- **WHEN** a client that ignores `_meta.ui` calls `needt_view_tasks`
- **THEN** it receives JSON text listing the tasks, their ids and their done state, and nothing in the result is a reference to the view

#### Scenario: Same data as the list tool
- **WHEN** `needt_view_tasks` and `needt_list` with `type: task` are called with the same arguments and token
- **THEN** every task returned by one for the same filter is returned by the other with the same fields

### Requirement: Restrictive sandbox and CSP

UI resources SHALL declare no `csp` entries and no `permissions`, so the host applies its default policy (no network, no external origins, no camera, microphone, geolocation or clipboard). The HTML SHALL load nothing from any other origin and SHALL contain no per-person data and no credentials.

#### Scenario: No external references
- **WHEN** the HTML of any registered resource is scanned
- **THEN** it contains no `http://` or `https://` URL in `src`, `href`, `@import`, `url(...)` or `fetch`/`XMLHttpRequest` calls, and no `@font-face` with a remote source

#### Scenario: Same document for everyone
- **WHEN** two different people read the same resource
- **THEN** the returned HTML is byte-identical

### Requirement: A widget acts with the caller's authority and no more

A tool call that a view makes through the host SHALL be authorised exactly like the same call made by the model: the same bearer token, scope check, workspace resolution, role check, write rate limit and undo record. The server SHALL NOT add a code path that a view can reach and the model cannot.

#### Scenario: Read-only connection cannot tick
- **WHEN** a view on a connection that has only `needt.read` calls `needt_complete_task`
- **THEN** the call is refused with the insufficient-scope response and no task changes

#### Scenario: Tick counts toward the write limit
- **WHEN** a view calls `needt_complete_task` 31 times within a minute for one person
- **THEN** the 31st call returns a tool result with `error: "RATE_LIMITED"` and `retryAfterSeconds`, and no task changes on that call

#### Scenario: Viewer seat cannot write
- **WHEN** a view in a workspace where the person has a viewer seat calls `needt_complete_task`
- **THEN** the call is refused as it would be for the model and the task is unchanged

#### Scenario: Workspace cannot drift
- **WHEN** a view rendered for workspace A calls `needt_complete_task` with workspace A's `workspaceId`
- **THEN** only a task in workspace A can change, and a task id from workspace B answers not found

### Requirement: Mail stays metadata-only and outside widgets

No view tool SHALL return mail, and no view SHALL call a tool with `type: mail`. The `mail.read` scope SHALL NOT be required by any view tool.

#### Scenario: Mail scope not needed
- **WHEN** a token with `needt.read` and without `mail.read` calls each view tool
- **THEN** each returns data and no mail item appears in any result

#### Scenario: Mail never enters a result
- **WHEN** a person with `mail.read` and synced mail calls each view tool
- **THEN** no result contains a sender, subject, snippet or label of any message

### Requirement: Private pages stay away from widgets

View tool results SHALL NOT contain the title, body, preview or link of a page in a private tree. They SHALL return a task's `originPageId` only when `needt_list` returns it for the same caller.

#### Scenario: Private page content absent
- **WHEN** a task was created from a page in a private tree and a view tool returns that task
- **THEN** the result contains none of that page's title or text

#### Scenario: View tools add no page fields
- **WHEN** the result of any view tool is inspected
- **THEN** it has no `page`, `pageTitle`, `blocks` or `preview` field

### Requirement: Server-controlled rollout

The whole MCP Apps surface SHALL be controlled by the server-side flag `mcp-app-widgets`, evaluated per person, and turning the flag off SHALL take effect without a deploy.

#### Scenario: Flag toggled
- **WHEN** the flag is switched off for a person who was seeing the extension
- **THEN** the person's next `initialize` and `tools/list` show no UI extension and no `_meta.ui`, while the view tools still return JSON

### Requirement: Negotiation is stateless

The server SHALL NOT keep per-connection state to decide whether to emit UI metadata. It SHALL emit `_meta.ui` on `tools/list` regardless of what the client declared, relying on hosts to ignore it when unsupported.

#### Scenario: Client declares nothing
- **WHEN** a client sends `initialize` without any `extensions` capability and then `tools/list`
- **THEN** the view tools are still listed, with `_meta.ui` when the flag is on, and calling them returns normal JSON results
