- Connections: configuration hints (`COMPOSIO_API_KEY` and other environment
  names) are for admins only. The connect-start answers of Composio apps and
  both mailboxes now say "<App> isn't available yet." to everyone else.
- Connections: the "Needt API" tile now opens a sheet to create a personal
  access token, copy the MCP URL (`https://mcp.needt.app/mcp`) and open the
  connector API docs, on desktop and phone. It uses the existing
  `/api/connector-settings` route.
