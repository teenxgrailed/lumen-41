import { NextResponse } from "next/server";

import {
  CORS_HEADERS,
  authorizationServerMetadata,
  corsPreflight,
} from "@/services/oauth/http";

/** RFC 8414 metadata for the authorization server behind the MCP server. */
export async function GET() {
  return NextResponse.json(authorizationServerMetadata(), {
    headers: { ...CORS_HEADERS, "Cache-Control": "public, max-age=3600" },
  });
}

export async function OPTIONS() {
  return corsPreflight();
}
