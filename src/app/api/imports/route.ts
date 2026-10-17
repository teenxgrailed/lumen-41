import { NextRequest } from "next/server";

import {
  listImportsResponse,
  startImportResponse,
} from "@/services/imports/http";
import { WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { publicAppUrl } from "@/lib/public-url";
import { accountRule, enforceRateLimits } from "@/lib/security/rate-limit";

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
  // An import queues a long job against someone else's API; a handful an hour
  // is plenty for a person and stops a script from queueing thousands.
  const limited = await enforceRateLimits(
    [accountRule(auth.userId, "imports:start:account", 10, 60 * 60)],
    { route: "/api/imports", userId: auth.userId }
  );
  if (limited) return limited;
  const body = await request.json().catch(() => null);
  return startImportResponse({
    userId: auth.userId,
    workspaceId: auth.workspace!.workspaceId,
    body,
    authorizeUrl: (workspaceId, source) => {
      const url = publicAppUrl(`/api/imports/${source}/authorize`, request);
      url.searchParams.set("workspaceId", workspaceId);
      return url.toString();
    },
  });
}
