import { NextRequest, NextResponse } from "next/server";

import { listAdminFeatureFlags } from "@/services/admin/feature-flags";

import { requireAdmin } from "@/lib/auth/api-auth";

/** Every known flag and every stored one; see `listAdminFeatureFlags`. */
export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  return NextResponse.json({ flags: await listAdminFeatureFlags() });
}
