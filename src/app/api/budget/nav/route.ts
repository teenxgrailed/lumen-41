import { NextRequest, NextResponse } from "next/server";

import { WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { budgetModuleEnabled } from "@/lib/feature-flags";

const LOG_SOURCE = "budget-nav";

/**
 * Whether the Budget place exists for this person (the `budget_module` flag).
 * The sidebar asks on every load, so an account without the flag gets a plain
 * `{ enabled: false }`, never an error. The plan is read by the client from
 * `/api/billing`: Free still sees the place, locked. Session auth only.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.VIEWER,
  });
  if (auth.response) return auth.response;
  return NextResponse.json(
    { enabled: await budgetModuleEnabled(auth.userId) },
    { headers: { "Cache-Control": "no-store" } }
  );
}
