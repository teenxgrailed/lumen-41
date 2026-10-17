import { NextRequest, NextResponse } from "next/server";

import { adminActorId } from "@/services/admin/audit";
import {
  AdminActionError,
  adminUserActionSchema,
  runAdminUserAction,
} from "@/services/admin/user-actions";

import { routeErrorResponse } from "@/lib/api/route-error";
import { requireAdmin } from "@/lib/auth/api-auth";

const LOG_SOURCE = "AdminUserActionAPI";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/users/:id/actions : one confirmed change to one account,
 * recorded in the audit log. Body: `{ action, ...fields }`, see
 * `adminUserActionSchema`.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    const actorId = await adminActorId(request);
    if (!actorId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const parsed = adminUserActionSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: "That action is not valid." },
        { status: 400 }
      );
    }
    const { id } = await params;
    return NextResponse.json(
      await runAdminUserAction(actorId, id, parsed.data)
    );
  } catch (error) {
    if (error instanceof AdminActionError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    return routeErrorResponse(
      error,
      "Admin user action failed",
      LOG_SOURCE,
      "The action could not be completed."
    );
  }
}
