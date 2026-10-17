import { NextRequest, NextResponse } from "next/server";

import { REQUIRES } from "@/services/integrations/catalog";
import { composioProvider } from "@/services/integrations/composio-provider";
import { ExternalIntegrationStatus } from "@prisma/client";

import { routeErrorResponse } from "@/lib/api/route-error";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";
import { publicAppUrl } from "@/lib/public-url";

const LOG_SOURCE = "IntegrationConnectAPI";

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body.toolkit !== "string") {
      return NextResponse.json(
        { error: "Toolkit is required" },
        { status: 400 }
      );
    }
    if (!composioProvider.isConfigured()) {
      // What to add on the server is for an admin only; everyone else just
      // learns the app is not there yet. No environment name leaves here.
      const viewer = await prisma.user.findUnique({
        where: { id: auth.userId },
        select: { role: true },
      });
      const app = (await composioProvider.listCatalog()).find(
        (item) => item.slug === body.toolkit
      );
      const name = app?.name ?? "This app";
      return NextResponse.json(
        {
          error:
            viewer?.role === "admin"
              ? `${name} needs ${REQUIRES.composio}. Add it, then try again.`
              : `${name} isn't available yet.`,
        },
        { status: 503 }
      );
    }
    const callbackUrl = publicAppUrl("/api/integrations/callback", request);
    callbackUrl.searchParams.set("toolkit", body.toolkit);
    const result = await composioProvider.initiateConnection({
      userId: auth.userId,
      toolkit: body.toolkit,
      callbackUrl: callbackUrl.toString(),
    });
    await prisma.externalIntegration.upsert({
      where: {
        userId_provider_toolkit_externalConnectionId: {
          userId: auth.userId,
          provider: composioProvider.id,
          toolkit: body.toolkit,
          externalConnectionId: result.connectionId,
        },
      },
      create: {
        userId: auth.userId,
        provider: composioProvider.id,
        toolkit: body.toolkit,
        externalConnectionId: result.connectionId,
        status: ExternalIntegrationStatus.DISCONNECTED,
        permissions: { read: true, writeRequiresConfirmation: true },
      },
      update: { status: ExternalIntegrationStatus.DISCONNECTED },
    });
    return NextResponse.json(result);
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to start integration connection",
      LOG_SOURCE,
      "Could not connect integration."
    );
  }
}
