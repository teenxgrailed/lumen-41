import { NextRequest, NextResponse } from "next/server";

import { passwordSchema } from "@/lib/auth/password-schema";
import { isSigningUpSession } from "@/lib/auth/signing-up-session";
import { confirmEmailVerification } from "@/lib/email/email-verification";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "EmailVerificationConfirmAPI";

/* Same rule as sign-up and the reset-password route. */
const newPasswordSchema = passwordSchema;

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    email?: unknown;
    token?: unknown;
    newPassword?: unknown;
  } | null;
  const email = typeof body?.email === "string" ? body.email : "";
  const token = typeof body?.token === "string" ? body.token : "";
  if (!email || !token) {
    return NextResponse.json({ status: "invalid" }, { status: 400 });
  }
  let newPassword: string | undefined;
  if (body?.newPassword !== undefined) {
    const parsed = newPasswordSchema.safeParse(body.newPassword);
    if (!parsed.success) {
      return NextResponse.json({ status: "weak_password" }, { status: 400 });
    }
    newPassword = parsed.data;
  }

  try {
    return NextResponse.json(
      await confirmEmailVerification({
        email,
        token,
        newPassword,
        sameSession: await isSigningUpSession(request, email),
      })
    );
  } catch (error) {
    await logger.error(
      "Email verification confirmation failed",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}
