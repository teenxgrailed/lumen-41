import { NextRequest, NextResponse } from "next/server";

import { hash } from "bcryptjs";
import { z } from "zod";

import { hashPasswordResetToken } from "@/lib/auth/password-reset-token";
import {
  forgetSessionState,
  revokeAllAccess,
} from "@/lib/auth/session-version";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { sandboxLockedResponse } from "@/lib/sandbox/guard";
import {
  accountRule,
  enforceRateLimits,
  ipRule,
} from "@/lib/security/rate-limit";

const LOG_SOURCE = "ResetPasswordAPI";

// Validation schema for reset request
const resetSchema = z.object({
  token: z.string().min(1, "Reset token is required"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).*$/,
      "Password must contain at least one uppercase letter, one lowercase letter, and one number"
    ),
});

/**
 * POST /api/auth/reset-password/reset
 * Reset password using a valid token
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const result = resetSchema.safeParse(body);

    if (!result.success) {
      logger.warn(
        "Invalid reset password request",
        {
          errors: result.error.errors.map((err) => err.message),
        },
        LOG_SOURCE
      );
      return NextResponse.json(
        {
          error: "Invalid request",
          details: result.error.errors,
        },
        { status: 400 }
      );
    }

    const { token, password } = result.data;
    const limited = await enforceRateLimits(
      [
        ipRule(request, "password-reset:ip", 10, 60 * 60),
        accountRule(token, "password-reset:token", 5, 60 * 60),
      ],
      { route: request.nextUrl.pathname }
    );
    if (limited) return limited;

    // Find the reset token (stored as its sha256, never in the clear)
    const resetRequest = await prisma.passwordReset.findFirst({
      where: {
        token: hashPasswordResetToken(token),
        expiresAt: {
          gt: new Date(),
        },
        usedAt: null,
      },
      include: {
        user: {
          include: {
            accounts: {
              where: {
                provider: "credentials",
              },
            },
          },
        },
      },
    });

    if (
      !resetRequest ||
      !resetRequest.user ||
      !resetRequest.user.accounts?.[0]
    ) {
      logger.warn(
        "Invalid or expired reset token used",
        { tokenHash: accountRule(token, "log", 1, 1).identifier },
        LOG_SOURCE
      );
      return NextResponse.json(
        { error: "Invalid or expired reset token" },
        { status: 400 }
      );
    }

    // A sandbox account's password comes from the server's env and nothing
    // else (docs/sandbox-accounts.md).
    if (resetRequest.user.sandboxKind) {
      return sandboxLockedResponse("account_identity");
    }

    // Hash the new password
    const hashedPassword = await hash(password, 10);

    // Update the password, mark the token as used, sign the person out of
    // every device that was signed in with the old password and revoke the
    // connector token external tools use.
    await prisma.$transaction([
      ...revokeAllAccess(resetRequest.user.id),
      prisma.account.update({
        where: {
          id: resetRequest.user.accounts[0].id,
        },
        data: {
          id_token: hashedPassword,
        },
      }),
      prisma.passwordReset.update({
        where: {
          id: resetRequest.id,
        },
        data: {
          usedAt: new Date(),
        },
      }),
    ]);
    forgetSessionState(resetRequest.user.id);

    logger.info(
      "Password reset successful",
      { userId: resetRequest.userId },
      LOG_SOURCE
    );

    return NextResponse.json({
      message: "Password has been reset successfully",
    });
  } catch (error) {
    logger.error(
      "Error in password reset",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );

    return NextResponse.json(
      { error: "An error occurred processing your request" },
      { status: 500 }
    );
  }
}
