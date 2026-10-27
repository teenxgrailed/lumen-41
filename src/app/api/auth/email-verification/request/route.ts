import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

import { authSecret } from "@/lib/auth/auth-secret";
import { sendEmailVerification } from "@/lib/email/email-verification";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { publicRequestUrl } from "@/lib/public-url";
import {
  accountRule,
  enforceRateLimits,
  ipRule,
} from "@/lib/security/rate-limit";

const LOG_SOURCE = "EmailVerificationRequestAPI";

export async function POST(request: NextRequest) {
  const token = await getToken({ req: request, secret: authSecret() });
  const body = token?.sub
    ? null
    : ((await request.json().catch(() => null)) as { email?: unknown } | null);
  const requestedEmail =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : null;
  const rateLimitIdentity = token?.sub ?? requestedEmail ?? "missing";
  const limited = await enforceRateLimits(
    [
      ipRule(request, "email-verification:ip", 10, 60 * 60),
      accountRule(rateLimitIdentity, "email-verification:account", 3, 60 * 60),
      // Resend cooldown: one mail a minute, matching the screen's countdown.
      accountRule(rateLimitIdentity, "email-verification:cooldown", 1, 60),
    ],
    { route: request.nextUrl.pathname }
  );
  if (limited) return limited;
  const user = await prisma.user.findFirst({
    where: token?.sub
      ? { id: token.sub }
      : requestedEmail
        ? { email: requestedEmail }
        : { id: "" },
    select: { id: true, email: true },
  });
  if (!user?.email) {
    return NextResponse.json({ sent: true });
  }

  try {
    await sendEmailVerification({
      userId: user.id,
      baseUrl: publicRequestUrl(request).origin,
    });
    return NextResponse.json({ sent: true });
  } catch (error) {
    await logger.error(
      "Email verification resend failed",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Could not send verification email" },
      { status: 503 }
    );
  }
}
