import { NextRequest, NextResponse } from "next/server";

import {
  IMPORT_STATE_COOKIE,
  createImportRun,
  findActiveImportRun,
  importsEnabled,
  verifyImportOAuthState,
} from "@/services/imports/service";
import {
  TodoistApiError,
  exchangeTodoistCode,
  getTodoistOAuthConfig,
} from "@/services/imports/todoist/client";
import { WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import {
  WorkspaceAuthorizationError,
  resolveWorkspaceAccess,
} from "@/lib/auth/workspace-auth";
import { logger } from "@/lib/logger";
import { publicAppUrl } from "@/lib/public-url";

const LOG_SOURCE = "TodoistImportCallback";

function backToSettings(request: NextRequest, result: string) {
  const url = publicAppUrl("/settings", request);
  url.searchParams.set("import", result);
  url.hash = "data";
  const response = NextResponse.redirect(url);
  response.cookies.set(IMPORT_STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/imports",
    maxAge: 0,
  });
  return response;
}

/**
 * Browser step two: Todoist sends the person back with `code` and `state`.
 * The state must be signed for this session's user and match the nonce
 * cookie; then the code becomes a token, the token goes (encrypted) onto a
 * new run, and the run is queued. The person lands on Settings → Data.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  const verified = verifyImportOAuthState(
    request.nextUrl.searchParams.get("state"),
    auth.userId,
    request.cookies.get(IMPORT_STATE_COOKIE)?.value
  );
  if (!verified) {
    return NextResponse.json(
      { error: "Invalid or expired import state" },
      { status: 400 }
    );
  }
  if (request.nextUrl.searchParams.get("error")) {
    return backToSettings(request, "todoist-denied");
  }
  const code = request.nextUrl.searchParams.get("code");
  const config = getTodoistOAuthConfig();
  if (!code || !config || !(await importsEnabled(auth.userId))) {
    return backToSettings(request, "todoist-failed");
  }

  try {
    await resolveWorkspaceAccess({
      userId: auth.userId,
      requestedWorkspaceId: verified.workspaceId,
      requiredRole: WorkspaceRole.EDITOR,
    });
  } catch (error) {
    if (error instanceof WorkspaceAuthorizationError) {
      return backToSettings(request, "todoist-failed");
    }
    throw error;
  }

  try {
    if (await findActiveImportRun(auth.userId, "todoist")) {
      return backToSettings(request, "todoist-running");
    }
    const token = await exchangeTodoistCode(config, code);
    const run = await createImportRun({
      userId: auth.userId,
      workspaceId: verified.workspaceId,
      source: "todoist",
      token,
    });
    return backToSettings(
      request,
      run.status === "failed" ? "todoist-failed" : "todoist-started"
    );
  } catch (error) {
    await logger.error(
      "Todoist import could not start",
      {
        error: error instanceof Error ? error.message : String(error),
        code: error instanceof TodoistApiError ? error.code : null,
      },
      LOG_SOURCE
    );
    return backToSettings(request, "todoist-failed");
  }
}
