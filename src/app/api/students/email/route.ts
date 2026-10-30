import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { publicAppUrl } from "@/lib/public-url";
import { refuseSandbox } from "@/lib/sandbox/guard";
import {
  accountRule,
  enforceRateLimits,
  ipRule,
} from "@/lib/security/rate-limit";
import {
  STUDENT_SUPPORT_EMAIL,
  requestStudentEmailLink,
} from "@/lib/students/student-service";

const LOG_SOURCE = "StudentEmailAPI";

const bodySchema = z.object({ email: z.string().trim().email().max(254) });

const MESSAGES = {
  not_university: `We don't recognise that school. Write to ${STUDENT_SUPPORT_EMAIL} with proof of enrolment and we'll send you a code.`,
  taken: `That address already holds a student price on another account. Write to ${STUDENT_SUPPORT_EMAIL} if it is yours.`,
  invalid: "Could not add that address.",
} as const;

/**
 * POST /api/students/email `{ email }`: Settings, Plan, "Add a university
 * email". Mails a signed confirm link to the address (or records the
 * account's own confirmed address at once). Answers `{ outcome }`.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const locked = await refuseSandbox(auth.userId, "billing");
  if (locked) return locked;

  const limited = await enforceRateLimits(
    [
      ipRule(request, "student-email:ip", 20, 60 * 60),
      accountRule(auth.userId, "student-email:account", 5, 60 * 60),
    ],
    { route: "/api/students/email", userId: auth.userId }
  );
  if (limited) return limited;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Enter an email address." },
      { status: 400 }
    );
  }

  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL?.trim() ||
      process.env.NEXTAUTH_URL?.trim() ||
      publicAppUrl("/", request).origin;
    const outcome = await requestStudentEmailLink({
      userId: auth.userId,
      email: parsed.data.email,
      baseUrl,
    });
    if (outcome === "sent" || outcome === "verified") {
      return NextResponse.json({ outcome });
    }
    return NextResponse.json(
      { outcome, error: MESSAGES[outcome] },
      { status: outcome === "taken" ? 409 : 422 }
    );
  } catch (error) {
    await logger.error(
      "Could not send the student email link",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Could not send the email. Try again in a minute." },
      { status: 502 }
    );
  }
}
