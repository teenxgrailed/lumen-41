import { NextRequest, NextResponse } from "next/server";

import { mcpResource, mcpResourceMetadata } from "@/lib/mcp-config";

type RouteContext = { params: Promise<{ path?: string[] }> };

/**
 * RFC 9728 protected resource metadata for the remote MCP server.
 *
 * Served at `/.well-known/oauth-protected-resource` and at the path-suffixed
 * form for the canonical resource (`…/oauth-protected-resource/mcp`), on the
 * MCP host and on the app host. Only the canonical resource is described:
 * OAuth tokens are bound to it, so a client must connect to
 * `https://mcp.needt.app/mcp` to use OAuth. The app host's `/api/mcp` takes
 * personal tokens only and has no metadata of its own.
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { path = [] } = await params;
  const suffix = path.join("/");
  const resourcePath = new URL(mcpResource()).pathname.replace(/^\//, "");
  if (suffix && suffix !== resourcePath) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json(mcpResourceMetadata(), {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}
