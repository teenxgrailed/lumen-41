import { NextResponse } from "next/server";

import { CORS_HEADERS, corsPreflight } from "@/services/oauth/http";
import { loadSigningKey } from "@/services/oauth/oidc";

/**
 * The public half of the key id_tokens are signed with (RFC 7517). Clients
 * cache it and fetch it again when an id_token names a `kid` they do not
 * know, which is how a rotated key reaches them.
 */
export async function GET() {
  const key = await loadSigningKey();
  if (!key) {
    return NextResponse.json(
      {
        error: "server_error",
        error_description: "No signing key is configured.",
      },
      { status: 503, headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } }
    );
  }
  return NextResponse.json(
    { keys: [key.publicJwk] },
    { headers: { ...CORS_HEADERS, "Cache-Control": "public, max-age=300" } }
  );
}

export async function OPTIONS() {
  return corsPreflight();
}
