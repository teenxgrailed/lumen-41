import { NextRequest, NextResponse } from "next/server";

import { getAdminOperations } from "@/services/admin/operations";

import { requireAdmin } from "@/lib/auth/api-auth";

export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  return NextResponse.json(await getAdminOperations());
}
