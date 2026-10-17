import { NextRequest, NextResponse } from "next/server";

import { planMyDay } from "@/services/ai/plan-day";
import { opErrorResponse } from "@/services/ops/http";
import { WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { canPlanMyDay } from "@/lib/entitlements";
import { accountRule, enforceRateLimits } from "@/lib/security/rate-limit";

const LOG_SOURCE = "ai-plan-day";

/**
 * Plan my day: place what has no time yet into the free slots, recorded as one
 * undoable action. Pro and Lifetime only (a trial counts as Pro). The answer
 * says where each task went and what did not fit; `actionId` is undone with
 * POST /api/agent/actions/:id/undo.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.EDITOR,
  });
  if ("response" in auth) return auth.response;

  const limited = await enforceRateLimits(
    [accountRule(auth.userId, "ai-plan-day:account", 20, 60)],
    { route: "/api/ai/plan-day", userId: auth.userId }
  );
  if (limited) return limited;

  const entitlement = await canPlanMyDay(auth.userId);
  if (!entitlement.allowed) {
    return NextResponse.json(
      {
        error: "Plan my day is available on Needt Pro and Lifetime.",
        code: "UPGRADE_REQUIRED",
        upgradeRequired: true,
      },
      { status: 403 }
    );
  }

  try {
    return NextResponse.json(
      await planMyDay({
        userId: auth.userId,
        workspace: auth.workspace!,
        actor: "user",
      })
    );
  } catch (error) {
    return opErrorResponse(error, LOG_SOURCE);
  }
}
