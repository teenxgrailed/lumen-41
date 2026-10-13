# Needt MCP

Needt hosts its MCP server inside the web app at `/api/mcp` (Streamable HTTP,
stateless JSON). The tool catalogue lives in
`src/services/connectors/mcp/tools.ts`; see `docs/connector-api.md` for the
tool list.

Generate a token in Needt: Settings -> Personal API.

## Claude Code (recommended)

```bash
claude mcp add --transport http needt https://use.needt.app/api/mcp \
  --header "Authorization: Bearer needt_REPLACE_ME"
```

Add `--header "x-workspace-id: <id>"` to work in a shared workspace instead of
the personal one.

## stdio bridge

`needt-mcp-server.mjs` is a thin stdio-to-HTTP bridge for clients that only
launch local processes. It forwards every JSON-RPC message to
`${NEEDT_BASE_URL}/api/mcp` and has no tool list of its own.

```bash
NEEDT_BASE_URL=https://use.needt.app
NEEDT_CONNECT_TOKEN=needt_REPLACE_ME
NEEDT_WORKSPACE_ID=        # optional
npm run mcp:needt
```

### Claude Desktop

```json
{
  "mcpServers": {
    "needt": {
      "command": "node",
      "args": ["/path/to/Needt/mcp/needt-mcp-server.mjs"],
      "env": {
        "NEEDT_BASE_URL": "https://use.needt.app",
        "NEEDT_CONNECT_TOKEN": "needt_REPLACE_ME"
      }
    }
  }
}
```
