import { NextRequest, NextResponse } from "next/server";

import { authenticateBlockingRequest } from "@/services/blocking/auth";
import { loadActiveBlocking } from "@/services/blocking/store";
import { WorkspaceRole } from "@prisma/client";

import { routeErrorResponse } from "@/lib/api/route-error";

const LOG_SOURCE = "BlockingActiveAPI";

/**
 * GET /api/blocking/active -> { active, mode, sites, apps, until, profiles }
 * What to block right now and why. The browser extension and the Mac app poll
 * it (and refresh at `until`); they enforce, Needt only decides.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateBlockingRequest(
    request,
    LOG_SOURCE,
    WorkspaceRole.VIEWER
  );
  if ("response" in auth) return auth.response;
  try {
    return NextResponse.json(await loadActiveBlocking(auth.userId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to read active blocking",
      LOG_SOURCE
    );
  }
}
