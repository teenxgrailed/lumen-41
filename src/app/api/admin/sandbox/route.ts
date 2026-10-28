import { NextRequest, NextResponse } from "next/server";

import { adminActorId, recordAdminAudit } from "@/services/admin/audit";
import { resetSandboxAccounts } from "@/services/sandbox/sandbox-service";

import { routeErrorResponse } from "@/lib/api/route-error";
import { requireAdmin } from "@/lib/auth/api-auth";

const LOG_SOURCE = "AdminSandboxAPI";

export const runtime = "nodejs";

/**
 * POST /api/admin/sandbox : "Reset sandbox now". Provisions the sandbox
 * accounts from the env, then wipes and reseeds each one, exactly as the
 * nightly job does (docs/sandbox-accounts.md).
 */
export async function POST(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    const actorId = await adminActorId(request);
    if (!actorId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const result = await resetSandboxAccounts();
    if (!result.enabled) {
      return NextResponse.json(
        {
          error:
            "Sandbox accounts are off. Turn on the sandbox_accounts flag (100%) first.",
        },
        { status: 409 }
      );
    }
    for (const account of result.reset) {
      await recordAdminAudit({
        actorId,
        targetUserId: account.userId,
        action: "user.reset_sandbox",
        details: { kind: account.kind, tokensRevoked: account.tokensRevoked },
      });
    }
    const refused = result.provisioned.filter((p) => p.status === "refused");
    const parts = [
      result.reset.length === 0
        ? "No sandbox account to reset. Set SANDBOX_REVIEWER_EMAIL and SANDBOX_REVIEWER_PASSWORD."
        : `Reset ${result.reset.length} sandbox account${result.reset.length === 1 ? "" : "s"}.`,
      ...refused.map((p) => p.reason ?? "Provisioning was refused."),
      ...(result.failed > 0 ? [`${result.failed} failed; see the logs.`] : []),
    ];
    return NextResponse.json({
      message: parts.join(" "),
      reset: result.reset.length,
      failed: result.failed,
      provisioned: result.provisioned.map((p) => ({
        kind: p.kind,
        status: p.status,
      })),
    });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Sandbox reset failed",
      LOG_SOURCE,
      "The sandbox could not be reset."
    );
  }
}
