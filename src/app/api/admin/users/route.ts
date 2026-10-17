import { NextRequest, NextResponse } from "next/server";

import { searchAdminUsers } from "@/services/admin/users";

import { routeErrorResponse } from "@/lib/api/route-error";
import { requireAdmin } from "@/lib/auth/api-auth";

const LOG_SOURCE = "AdminUsersAPI";

export const runtime = "nodejs";

/** GET /api/admin/users?q=part-of-an-email : up to 25 matches, newest first. */
export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    const q = request.nextUrl.searchParams.get("q") ?? "";
    return NextResponse.json({ users: await searchAdminUsers(q) });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to search users",
      LOG_SOURCE,
      "Could not search users."
    );
  }
}
