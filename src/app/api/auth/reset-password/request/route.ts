import { NextRequest, NextResponse } from "next/server";

import crypto from "crypto";

import { hashPasswordResetToken } from "@/lib/auth/password-reset-token";
import { sendPasswordResetEmail } from "@/lib/email/password-reset";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  accountRule,
  enforceRateLimits,
  ipRule,
} from "@/lib/security/rate-limit";

const LOG_SOURCE = "ResetPasswordRequestAPI";

/**
 * POST /api/auth/reset-password/request
 * Request a password reset token
 */
export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      logger.warn("Missing email in password reset request", {}, LOG_SOURCE);
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const limited = await enforceRateLimits(
      [
        ipRule(request, "password-reset-request:ip", 10, 60 * 60),
        accountRule(
          normalizedEmail,
          "password-reset-request:account",
          3,
          60 * 60
        ),
      ],
      { route: request.nextUrl.pathname }
    );
    if (limited) return limited;

    // Find the user
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        accounts: {
          where: {
            provider: "credentials",
          },
        },
      },
    });

    // Don't reveal if the user exists or not
    if (!user || !user.accounts || user.accounts.length === 0) {
      logger.info(
        "Password reset requested for non-existent user",
        { accountHash: accountRule(normalizedEmail, "log", 1, 1).identifier },
        LOG_SOURCE
      );
      return NextResponse.json({
        message:
          "If an account exists, you will receive a password reset email",
      });
    }

    // Generate a reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now

    // Store only the hash of the token (the raw token goes in the email link)
    // and invalidate any reset links this person still has outstanding.
    await prisma.$transaction([
      prisma.passwordReset.deleteMany({
        where: { userId: user.id, usedAt: null },
      }),
      prisma.passwordReset.create({
        data: {
          userId: user.id,
          token: hashPasswordResetToken(resetToken),
          expiresAt: resetTokenExpiry,
        },
      }),
    ]);

    // Send the password reset email
    await sendPasswordResetEmail({
      email: user.email!,
      name: user.name || "there",
      resetToken,
      expirationDate: resetTokenExpiry,
    });

    return NextResponse.json({
      message: "If an account exists, you will receive a password reset email",
    });
  } catch (error) {
    logger.error(
      "Error in password reset request",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );

    return NextResponse.json(
      { error: "An error occurred processing your request" },
      { status: 500 }
    );
  }
}
