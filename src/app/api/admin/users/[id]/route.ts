import { NextRequest, NextResponse } from "next/server";

import { adminActorId, listAuditForUser } from "@/services/admin/audit";
import { getAdminUserDetail } from "@/services/admin/users";

import { routeErrorResponse } from "@/lib/api/route-error";
import { requireAdmin } from "@/lib/auth/api-auth";

const LOG_SOURCE = "AdminUserAPI";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/admin/users/:id : one account and what admins have done to it. */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    const { id } = await params;
    const user = await getAdminUserDetail(id);
    if (!user) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({
      user,
      audit: await listAuditForUser(id),
      viewerId: await adminActorId(request),
    });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to load a user",
      LOG_SOURCE,
      "Could not load this account."
    );
  }
}
