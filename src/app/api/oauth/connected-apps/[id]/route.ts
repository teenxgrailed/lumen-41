import { NextRequest, NextResponse } from "next/server";

import { revokeConnectedApp } from "@/services/oauth/grants";

import { authenticateRequest } from "@/lib/auth/api-auth";

const LOG_SOURCE = "ConnectedAppsAPI";
type RouteContext = { params: Promise<{ id: string }> };

/** Disconnects one app: every token of that grant stops working at once. */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const revoked = await revokeConnectedApp(auth.userId, id);
  if (!revoked) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
