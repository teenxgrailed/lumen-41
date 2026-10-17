import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  accountRule,
  enforceRateLimits,
  ipRule,
} from "@/lib/security/rate-limit";
import {
  runTrialTransaction,
  startTrialForVerifiedUser,
} from "@/lib/trials/trial-service";

const LOG_SOURCE = "BillingTrialAPI";

/**
 * Starts the Pro trial for an account that has not had one.
 *
 * The trial is granted when the email is confirmed (trial-service.ts), so a
 * person who confirmed before trials existed, or whose grant was never made,
 * has none. This is the same service, the same one-per-email rule and the
 * same length; it does not make a second trial for anyone who has had one,
 * and it takes no card. Payments are a different route and a different switch.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  const limited = await enforceRateLimits(
    [
      ipRule(request, "billing-trial:ip", 10, 60 * 60),
      accountRule(auth.userId, "billing-trial:account", 5, 60 * 60),
    ],
    { route: "/api/billing/trial", userId: auth.userId }
  );
  if (limited) return limited;

  try {
    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { email: true, emailVerified: true },
    });
    if (!user?.email || !user.emailVerified) {
      return NextResponse.json(
        { error: "Confirm your email to start the trial." },
        { status: 400 }
      );
    }

    const email = user.email;
    const now = newDate();
    const grant = await runTrialTransaction((tx) =>
      startTrialForVerifiedUser(tx, { userId: auth.userId, email, now })
    );

    if (!grant || grant.endsAt <= now) {
      return NextResponse.json(
        {
          error: "The free trial has already been used for this email.",
          code: "TRIAL_USED",
        },
        { status: 409 }
      );
    }

    return NextResponse.json({
      started: true,
      trialEndsAt: grant.endsAt,
    });
  } catch (error) {
    logger.error(
      "Failed to start the trial",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Could not start the trial." },
      { status: 500 }
    );
  }
}
