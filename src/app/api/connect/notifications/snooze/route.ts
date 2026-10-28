import { NextRequest } from "next/server";

import { authenticateConnectorRequest } from "@/services/connectors/auth";
import { snoozeResponse } from "@/services/notifications/http";
import { WorkspaceRole } from "@prisma/client";

/** Hides feed rows until a time; read state is the caller's own, so VIEWER is enough. */
export async function POST(request: NextRequest) {
  const auth = await authenticateConnectorRequest(
    request,
    WorkspaceRole.VIEWER
  );
  if (auth.response) return auth.response;
  return snoozeResponse(auth.userId, request);
}
