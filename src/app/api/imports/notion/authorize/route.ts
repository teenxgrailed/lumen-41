import { NextRequest, NextResponse } from "next/server";

import {
  buildNotionAuthorizeUrl,
  getNotionOAuthConfig,
  notionRedirectUri,
} from "@/services/imports/notion/client";
import {
  IMPORT_STATE_COOKIE,
  IMPORT_STATE_TTL_SECONDS,
  createImportOAuthState,
  importsEnabled,
} from "@/services/imports/service";
import { WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";

const LOG_SOURCE = "NotionImportAuthorize";

/**
 * Browser step one: set the nonce cookie and send the person to Notion's
 * consent screen. Notion shows its own page picker there: only the pages and
 * databases the person picks are visible to the import.
 * `?workspaceId=` picks where the run lands.
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
  const config = getNotionOAuthConfig();
  if (!config) {
    return NextResponse.json(
      {
        error: "Notion import is not configured on this server",
        code: "NOT_CONFIGURED",
      },
      { status: 503 }
    );
  }

  const { state, nonce } = createImportOAuthState(
    auth.userId,
    auth.workspace!.workspaceId,
    "notion"
  );
  const response = NextResponse.redirect(
    buildNotionAuthorizeUrl(config, state, notionRedirectUri(request))
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
