import { NextResponse } from "next/server";

import { mcpServerCard } from "@/services/connectors/mcp/server-card";

/** Public, unauthenticated MCP server card for connector directories. */
export async function GET() {
  return NextResponse.json(mcpServerCard(), {
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
