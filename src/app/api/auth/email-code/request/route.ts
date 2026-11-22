import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import {
  EMAIL_CODE_RESEND_SECONDS,
  normalizeCodeEmail,
} from "@/lib/auth/email-code";
import { sendLoginCode } from "@/lib/auth/email-code-service";
import { logger } from "@/lib/logger";
import {
  accountRule,
  enforceRateLimits,
  ipRule,
} from "@/lib/security/rate-limit";

const LOG_SOURCE = "EmailCodeRequestAPI";

const bodySchema = z.object({ email: z.string().trim().email().max(254) });

/**
 * POST /api/auth/email-code/request
 * Mails a six-digit sign-in code. The answer is the same whether the address
 * has an account, is new, or may not sign in at all (a sandbox or deactivated
 * account, a new address while sign-up is closed): nothing is sent for the
 * last two and nobody can tell.
 */
export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 }
    );
  }
  const email = normalizeCodeEmail(parsed.data.email);

  const limited = await enforceRateLimits(
    [
      ipRule(request, "email-code:ip", 10, 60 * 60),
      accountRule(
        email,
        "email-code:account-resend",
        1,
        EMAIL_CODE_RESEND_SECONDS
      ),
      accountRule(email, "email-code:account", 5, 60 * 60),
      accountRule(email, "email-code:account-day", 10, 24 * 60 * 60),
    ],
    { route: request.nextUrl.pathname }
  );
  if (limited) return limited;

  try {
    await sendLoginCode(email);
  } catch (error) {
    logger.error(
      "Sending a login code failed",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Could not send the code. Try again in a moment." },
      { status: 503 }
    );
  }
  return NextResponse.json({
    ok: true,
    resendAfterSeconds: EMAIL_CODE_RESEND_SECONDS,
  });
}
