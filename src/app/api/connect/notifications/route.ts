import { NextRequest } from "next/server";

import { authenticateConnectorRequest } from "@/services/connectors/auth";
import { feedResponse } from "@/services/notifications/http";
import { WorkspaceRole } from "@prisma/client";

/** The notification feed for tools using a connector token. */
export async function GET(request: NextRequest) {
  const auth = await authenticateConnectorRequest(
    request,
    WorkspaceRole.VIEWER
  );
  if (auth.response) return auth.response;
  return feedResponse(auth, request.nextUrl.searchParams);
}
