import { NextRequest, NextResponse } from "next/server";

import { getAdminAgentsHub } from "@/services/admin/agents-hub";

import { routeErrorResponse } from "@/lib/api/route-error";
import { requireAdmin } from "@/lib/auth/api-auth";

const LOG_SOURCE = "AdminAgentsHubAPI";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    return NextResponse.json({ agentsHub: await getAdminAgentsHub() });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to load the Agents hub metrics",
      LOG_SOURCE,
      "Could not load the Agents hub metrics."
    );
  }
}
