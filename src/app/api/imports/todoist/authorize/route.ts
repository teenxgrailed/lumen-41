import { NextRequest, NextResponse } from "next/server";

import {
  IMPORT_STATE_COOKIE,
  IMPORT_STATE_TTL_SECONDS,
  createImportOAuthState,
  importsEnabled,
} from "@/services/imports/service";
import {
  buildTodoistAuthorizeUrl,
  getTodoistOAuthConfig,
} from "@/services/imports/todoist/client";
import { WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";

const LOG_SOURCE = "TodoistImportAuthorize";

/**
 * Browser step one: set the nonce cookie and send the person to Todoist's
 * consent screen (read-only scope). `?workspaceId=` picks where the run lands.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.EDITOR,
  });
  if ("response" in auth) return auth.response;
  if (!(await importsEnabled(auth.userId))) {
    return NextResponse.json(
      { error: "Imports are not available", code: "IMPORTS_DISABLED" },
      { status: 404 }
    );
  }
  const config = getTodoistOAuthConfig();
  if (!config) {
    return NextResponse.json(
      {
        error: "Todoist import is not configured on this server",
        code: "NOT_CONFIGURED",
      },
      { status: 503 }
    );
  }

  const { state, nonce } = createImportOAuthState(
    auth.userId,
    auth.workspace!.workspaceId
  );
  const response = NextResponse.redirect(
    buildTodoistAuthorizeUrl(config, state)
  );
  response.cookies.set(IMPORT_STATE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/imports",
    maxAge: IMPORT_STATE_TTL_SECONDS,
  });
  return response;
}
