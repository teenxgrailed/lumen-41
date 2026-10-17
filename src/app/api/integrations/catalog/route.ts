import { NextRequest, NextResponse } from "next/server";

import { getIntegrationCatalog } from "@/services/integrations/catalog";

import { routeErrorResponse } from "@/lib/api/route-error";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "IntegrationCatalogAPI";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  try {
    const viewer = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { role: true },
    });
    const isAdmin = viewer?.role === "admin";
    const [catalog, connections, pinterest] = await Promise.all([
      getIntegrationCatalog({ admin: isAdmin }),
      prisma.externalIntegration.findMany({
        where: { userId: auth.userId },
        select: {
          id: true,
          provider: true,
          toolkit: true,
          status: true,
          externalConnectionId: true,
        },
      }),
      prisma.pinterestConnection.findUnique({
        where: { userId: auth.userId },
        select: { id: true, status: true },
      }),
    ]);
    // Pinterest keeps its own grant; the card reads it as one more connection.
    if (pinterest) {
      connections.push({
        id: pinterest.id,
        provider: "pinterest",
        toolkit: "pinterest",
        status: pinterest.status === "CONNECTED" ? "CONNECTED" : "ERROR",
        externalConnectionId: pinterest.id,
      });
    }
    return NextResponse.json({ catalog, connections, isAdmin });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to load integration catalog",
      LOG_SOURCE,
      "Could not load integrations."
    );
  }
}
