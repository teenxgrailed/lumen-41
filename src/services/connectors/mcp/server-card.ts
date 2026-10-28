import {
  MCP_SCOPES,
  mcpResource,
  mcpResourceMetadataUrl,
  oauthIssuer,
} from "@/lib/mcp-config";

import { MCP_SERVER_INFO } from "./server";
import { listMcpTools } from "./tools";

/**
 * The public MCP server card served at `/.well-known/mcp/server-card.json`.
 * Directories (Anthropic connectors, Smithery, the MCP Registry) read it to
 * list the server without connecting. The tool list comes from the registry
 * itself, so it cannot drift from what `tools/list` returns. Admin tools are
 * left out: they are only shown to a token that carries needt.admin.read.
 */
export function mcpServerCard() {
  return {
    name: "Needt",
    description:
      "Needt is an intelligent planner. Read and change tasks, projects, calendar events, pages, habits, goals and memories in your Needt workspace, and let Needt schedule your work.",
    version: MCP_SERVER_INFO.version,
    homepage: oauthIssuer(),
    documentation: `${oauthIssuer()}/docs/connector-api`,
    endpoint: mcpResource(),
    transport: { type: "streamable-http", url: mcpResource() },
    authentication: {
      type: "oauth2",
      required: true,
      version: "2.1",
      dynamic_client_registration: true,
      resource_metadata: mcpResourceMetadataUrl(),
      scopes_supported: MCP_SCOPES.filter(
        (scope) => scope !== "needt.admin.read"
      ),
    },
    tools: listMcpTools().map((tool) => ({
      name: tool.name,
      title: tool.annotations?.title ?? tool.name,
      description: tool.description,
      annotations: tool.annotations,
    })),
  };
}
