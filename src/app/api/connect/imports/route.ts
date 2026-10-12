import { NextRequest } from "next/server";

import { authenticateConnectorRequest } from "@/services/connectors/auth";
import {
  listImportsResponse,
  startImportResponse,
} from "@/services/imports/http";
import { WorkspaceRole } from "@prisma/client";

import { publicAppUrl } from "@/lib/public-url";

export async function GET(request: NextRequest) {
  const auth = await authenticateConnectorRequest(
    request,
    WorkspaceRole.VIEWER
  );
  if ("response" in auth) return auth.response;
  return listImportsResponse(auth.userId);
}

/**
 * Same contract as POST /api/imports. With `token` (a Todoist personal API
 * token) the run starts at once; without it the answer is an authorizeUrl
 * the person opens in a browser where they are signed in to Needt.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateConnectorRequest(
    request,
    WorkspaceRole.EDITOR
  );
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => null);
  return startImportResponse({
    userId: auth.userId,
    workspaceId: auth.workspace.workspaceId,
    body,
    authorizeUrl: (workspaceId, source) => {
      const url = publicAppUrl(`/api/imports/${source}/authorize`, request);
      url.searchParams.set("workspaceId", workspaceId);
      return url.toString();
    },
  });
}
