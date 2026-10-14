import { NextRequest, NextResponse } from "next/server";

import { listConnectedApps } from "@/services/oauth/grants";

import { authenticateRequest } from "@/lib/auth/api-auth";

const LOG_SOURCE = "ConnectedAppsAPI";

/** The OAuth apps (claude.ai, ChatGPT, …) connected to this account. */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  return NextResponse.json({ apps: await listConnectedApps(auth.userId) });
}
