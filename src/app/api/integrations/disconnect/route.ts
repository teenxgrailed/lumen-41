import { NextRequest, NextResponse } from "next/server";

import { composioProvider } from "@/services/integrations/composio-provider";
import { ExternalIntegrationStatus } from "@prisma/client";

import { routeErrorResponse } from "@/lib/api/route-error";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "IntegrationDisconnectAPI";

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body.id !== "string")
      return NextResponse.json(
        { error: "Connection id is required" },
        { status: 400 }
      );
    const row = await prisma.externalIntegration.findFirst({
      where: { id: body.id, userId: auth.userId },
    });
    if (!row)
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 }
      );
    // Revoke the upstream grant first, but never let a provider failure keep
    // the local disconnect from succeeding. Skip when another account row
    // still points at the same connection.
    let revoked = false;
    try {
      const shared = await prisma.externalIntegration.count({
        where: {
          externalConnectionId: row.externalConnectionId,
          id: { not: row.id },
          status: ExternalIntegrationStatus.CONNECTED,
        },
      });
      if (shared === 0) {
        revoked = await composioProvider.revokeConnection(
          row.externalConnectionId
        );
      }
    } catch (error) {
      await logger.warn(
        "Provider revoke failed during disconnect",
        { error: error instanceof Error ? error.message : String(error) },
        LOG_SOURCE
      );
    }
    await prisma.externalIntegration.updateMany({
      where: { id: row.id, userId: auth.userId },
      data: { status: ExternalIntegrationStatus.DISCONNECTED },
    });
    return NextResponse.json({ success: true, revoked });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to disconnect integration",
      LOG_SOURCE,
      "Could not disconnect integration."
    );
  }
}
