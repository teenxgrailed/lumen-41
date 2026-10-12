import { NextResponse } from "next/server";

import { MCP_SCOPES, oauthIssuer } from "@/lib/mcp-config";

/** Public endpoints: called by servers and by browser-based MCP clients. */
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, MCP-Protocol-Version",
};

export function corsPreflight() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

/** RFC 6749 §5.2 error body; never cached. */
export function oauthErrorResponse(
  error: string,
  description: string,
  status = 400
) {
  return NextResponse.json(
    { error, error_description: description },
    {
      status,
      headers: {
        ...CORS_HEADERS,
        "Cache-Control": "no-store",
        Pragma: "no-cache",
      },
    }
  );
}

/** Reads an application/x-www-form-urlencoded body, or null for anything else. */
export async function formBody(
  request: Request
): Promise<URLSearchParams | null> {
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/x-www-form-urlencoded")) {
    return null;
  }
  const text = await request.text();
  if (text.length > 16 * 1024) return null;
  return new URLSearchParams(text);
}

/** RFC 8414 authorization server metadata. */
export function authorizationServerMetadata() {
  const issuer = oauthIssuer();
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    revocation_endpoint: `${issuer}/oauth/revoke`,
    scopes_supported: [...MCP_SCOPES],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
    service_documentation: `${issuer}/docs/connector-api`,
  };
}
