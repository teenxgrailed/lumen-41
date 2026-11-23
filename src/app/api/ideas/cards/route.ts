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

export async function GET(request: NextRequest) {
  const auth = await authenticate(request, false);
  if (auth.response) return auth.response;
  return ideaHandlers.cards(request, sessionCaller(auth), LOG_SOURCE);
}
