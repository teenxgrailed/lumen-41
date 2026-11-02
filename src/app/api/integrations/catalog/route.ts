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
    const [catalog, connections, pinterest, googleTasks] = await Promise.all([
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
      prisma.taskProvider.findFirst({
        where: { userId: auth.userId, type: "GOOGLE" },
        select: {
          id: true,
          accountId: true,
          error: true,
          account: { select: { email: true } },
        },
      }),
    ]);
    // `label` is the account a native connection belongs to, where its toolkit
    // name would say nothing (Google Tasks: the Google address).
    const rows: ((typeof connections)[number] & { label?: string })[] =
      connections;
    // Pinterest keeps its own grant; the card reads it as one more connection.
    if (pinterest) {
      rows.push({
        id: pinterest.id,
        provider: "pinterest",
        toolkit: "pinterest",
        status: pinterest.status === "CONNECTED" ? "CONNECTED" : "ERROR",
        externalConnectionId: pinterest.id,
      });
    }
    // Google Tasks keeps its own provider row; a lost account reads as an error.
    if (googleTasks) {
      rows.push({
        id: googleTasks.id,
        provider: "google-tasks",
        toolkit: "google-tasks",
        status:
          googleTasks.accountId && !googleTasks.error ? "CONNECTED" : "ERROR",
        externalConnectionId: googleTasks.accountId ?? googleTasks.id,
        label: googleTasks.account?.email ?? undefined,
      });
    }
    return NextResponse.json({ catalog, connections: rows, isAdmin });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to load integration catalog",
      LOG_SOURCE,
      "Could not load integrations."
    );
  }
}
