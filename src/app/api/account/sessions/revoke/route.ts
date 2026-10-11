import { NextRequest, NextResponse } from "next/server";

import { authenticateAccountRequest } from "@/lib/auth/account-request-auth";
import {
  SESSION_VERSION_RECHECK_MS,
  forgetSessionState,
  revokeAllAccess,
} from "@/lib/auth/session-version";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  accountRule,
  enforceRateLimits,
  ipRule,
} from "@/lib/security/rate-limit";

const LOG_SOURCE = "AccountSessionsRevokeAPI";

/**
 * POST /api/account/sessions/revoke
 * Signs the caller out of every device, this one included: every token issued
 * before this call stops working within SESSION_VERSION_RECHECK_MS, and the
 * connector token external tools use stops working at once. The caller should
 * sign this device out right after.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateAccountRequest(request);
  if (auth.response) return auth.response;
  const limited = await enforceRateLimits(
    [
      ipRule(request, "account-sessions-revoke:ip", 20, 60 * 60),
      accountRule(auth.user.id, "account-sessions-revoke:user", 10, 60 * 60),
    ],
    { route: request.nextUrl.pathname }
  );
  if (limited) return limited;
  const [, connectors] = await prisma.$transaction([
    ...revokeAllAccess(auth.user.id),
  ]);
  forgetSessionState(auth.user.id);
  logger.info(
    "Signed out of all devices",
    { userId: auth.user.id, connectorTokensRevoked: connectors.count },
    LOG_SOURCE
  );
  return NextResponse.json({
    revoked: true,
    connectorTokensRevoked: connectors.count,
    effectiveWithinSeconds: SESSION_VERSION_RECHECK_MS / 1000,
  });
}
