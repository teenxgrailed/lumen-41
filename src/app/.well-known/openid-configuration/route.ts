import { NextResponse } from "next/server";

import { CORS_HEADERS, corsPreflight } from "@/services/oauth/http";
import { openidConfiguration } from "@/services/oauth/oidc";

/** OpenID Connect Discovery 1.0 for Needt sign-in. */
export async function GET() {
  return NextResponse.json(openidConfiguration(), {
    headers: { ...CORS_HEADERS, "Cache-Control": "public, max-age=3600" },
  });
}

export async function OPTIONS() {
  return corsPreflight();
}
