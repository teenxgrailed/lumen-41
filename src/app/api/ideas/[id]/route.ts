import { NextRequest } from "next/server";

import { ideaHandlers, sessionCaller } from "@/services/ideas/http";
import { WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";

const LOG_SOURCE = "ideas-api";

/** The session; a change needs an editor seat, a read only a viewer's. */
const authenticate = (request: NextRequest, write: boolean) =>
  authenticateRequest(request, LOG_SOURCE, {
    requiredRole: write ? WorkspaceRole.EDITOR : WorkspaceRole.VIEWER,
  });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate(request, true);
  if (auth.response) return auth.response;
  const { id } = await params;
  return ideaHandlers.update(request, sessionCaller(auth), id, LOG_SOURCE);
}
