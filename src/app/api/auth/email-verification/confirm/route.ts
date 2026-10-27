import { NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { isSigningUpSession } from "@/lib/auth/signing-up-session";
import { confirmEmailVerification } from "@/lib/email/email-verification";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "EmailVerificationConfirmAPI";

/* Same rule as the reset-password route. */
const newPasswordSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).*$/);

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
