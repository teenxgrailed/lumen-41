import { NextRequest } from "next/server";

import { authenticateConnectorRequest } from "@/services/connectors/auth";
import { ideaHandlers, tokenCaller } from "@/services/ideas/http";
import { WorkspaceRole } from "@prisma/client";

const LOG_SOURCE = "connect-ideas";

/** A `needt_` token with read, or write for a change. */
const authenticate = (request: NextRequest, write: boolean) =>
  authenticateConnectorRequest(
    request,
    write ? WorkspaceRole.EDITOR : WorkspaceRole.VIEWER
  );

export async function GET(request: NextRequest) {
  const auth = await authenticate(request, false);
  if (auth.response) return auth.response;
  return ideaHandlers.list(request, tokenCaller(auth), LOG_SOURCE);
}

export async function POST(request: NextRequest) {
  const auth = await authenticate(request, true);
  if (auth.response) return auth.response;
  return ideaHandlers.create(request, tokenCaller(auth), LOG_SOURCE);
}
