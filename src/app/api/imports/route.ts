import { NextRequest } from "next/server";

import {
  listImportsResponse,
  startImportResponse,
} from "@/services/imports/http";
import { WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { publicAppUrl } from "@/lib/public-url";

const LOG_SOURCE = "ImportsAPI";

/** Whether imports are on for this person, which sources work, recent runs. */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  return listImportsResponse(auth.userId);
}

/**
 * Starts an import. Without a token the answer is the URL that sends the
 * person through Todoist's consent screen; with a personal API token the run
 * is queued straight away.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.EDITOR,
  });
  if ("response" in auth) return auth.response;
  const body = await request.json().catch(() => null);
  return startImportResponse({
    userId: auth.userId,
    workspaceId: auth.workspace!.workspaceId,
    body,
    authorizeUrl: (workspaceId) => {
      const url = publicAppUrl("/api/imports/todoist/authorize", request);
      url.searchParams.set("workspaceId", workspaceId);
      return url.toString();
    },
  });
}
