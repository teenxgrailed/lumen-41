import { NextRequest, NextResponse } from "next/server";

import { ExternalIntegrationStatus } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { publicAppUrl } from "@/lib/public-url";

const LOG_SOURCE = "IntegrationCallbackAPI";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const toolkit = request.nextUrl.searchParams.get("toolkit");
  // Composio adds `status=success|failed` to the callback. A person who
  // cancelled on the provider's page comes back here too, and must not be
  // marked connected.
  const status = request.nextUrl.searchParams.get("status");
  const refused = status !== null && status.toLowerCase() !== "success";
  if (toolkit && refused) {
    await logger.warn(
      "External integration callback was not successful",
      { userId: auth.userId, toolkit, status },
      LOG_SOURCE
    );
  } else if (toolkit) {
    await prisma.externalIntegration.updateMany({
      where: { userId: auth.userId, provider: "composio", toolkit },
      data: { status: ExternalIntegrationStatus.CONNECTED },
    });
    await logger.info(
      "External integration callback completed",
      { userId: auth.userId, toolkit },
      LOG_SOURCE
    );
  }
  return NextResponse.redirect(publicAppUrl("/settings#integrations", request));
}
