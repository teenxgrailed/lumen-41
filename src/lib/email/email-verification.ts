import { revokeConnectorTokens } from "@/services/connectors/auth";
import { hash as hashPassword } from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";

import { forgetSessionState } from "@/lib/auth/session-version";
import { isUnprovenPasswordAccount } from "@/lib/auth/unproven-password";
import { addHours, newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  runTrialTransaction,
  startTrialForVerifiedUser,
} from "@/lib/trials/trial-service";

import { EmailService } from "./email-service";
import { getEmailVerificationTemplate } from "./templates/email-verification";
import { getWelcomeTemplate } from "./templates/notifications";

const LOG_SOURCE = "EmailVerification";
const TOKEN_TTL_HOURS = 24;

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function sendEmailVerification(input: {
  userId: string;
  baseUrl: string;
}) {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { email: true, emailVerified: true, name: true },
  });
  if (!user?.email || user.emailVerified) return { sent: false } as const;

  const email = user.email.trim().toLowerCase();
  const rawToken = randomBytes(32).toString("base64url");
  const hash = tokenHash(rawToken);
  const expires = addHours(newDate(), TOKEN_TTL_HOURS);

  await prisma.verificationToken.deleteMany({
    where: { identifier: email, expires: { lt: newDate() } },
  });
  await prisma.verificationToken.create({
    data: { identifier: email, token: hash, expires },
  });

  const verificationUrl = new URL("/auth/confirm-email", input.baseUrl);
  verificationUrl.searchParams.set("email", email);
  verificationUrl.searchParams.set("token", rawToken);
  const template = getEmailVerificationTemplate({
    name: user.name || "there",
    verificationUrl: verificationUrl.toString(),
  });
  let result: { jobId: string };
  try {
    result = await EmailService.sendEmail({
      to: email,
      ...template,
    });
  } catch (error) {
    await prisma.verificationToken.deleteMany({
      where: { identifier: email, token: hash },
    });
    throw error;
  }
  await logger.info(
    "Email verification sent",
    { userId: input.userId, jobId: result.jobId },
    LOG_SOURCE
  );
  return { sent: true } as const;
}

/**
 * `sameSession`: the request carries a live session of this very account, the
 * browser that signed up. Anyone else confirming (a fresh browser, the inbox
 * owner who may never have set the password on the account) must choose a new
 * password, and every session that existed before is signed out; until they do
 * the answer is `password_required` and the link is not spent. Without this, a
 * stranger who registered the address first would keep their password and open
 * session on the account the real owner just confirmed.
 */
export async function confirmEmailVerification(input: {
  email: string;
  token: string;
  now?: Date;
  sameSession?: boolean;
  newPassword?: string;
}) {
  const email = input.email.trim().toLowerCase();
  const hash = tokenHash(input.token);
  const now = input.now ?? newDate();
  const newPasswordHash = input.newPassword
    ? await hashPassword(input.newPassword, 12)
    : null;

  const result = await runTrialTransaction(async (tx) => {
    const verification = await tx.verificationToken.findUnique({
      where: { identifier_token: { identifier: email, token: hash } },
    });
    if (!verification) return { status: "invalid" as const, trial: false };
    if (verification.expires <= now) {
      await tx.verificationToken.delete({
        where: { identifier_token: { identifier: email, token: hash } },
      });
      return { status: "expired" as const, trial: false };
    }

    const user = await tx.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        emailVerified: true,
        accounts: {
          where: { provider: "credentials" },
          select: { provider: true, id_token: true },
        },
      },
    });
    if (!user?.email) return { status: "invalid" as const, trial: false };

    const unproven = isUnprovenPasswordAccount(user);
    const replacePassword = unproven && !input.sameSession;
    if (replacePassword && !newPasswordHash) {
      return { status: "password_required" as const, trial: false };
    }
    if (replacePassword && newPasswordHash) {
      await tx.account.updateMany({
        where: { userId: user.id, provider: "credentials" },
        data: { id_token: newPasswordHash },
      });
      await tx.adminAuditLog.create({
        data: {
          actorId: null,
          targetUserId: user.id,
          action: "auth.unproven_password_reset_on_confirm",
          details: {},
        },
      });
    }
    await tx.user.update({
      where: { id: user.id },
      data: {
        emailVerified: now,
        /* Every session issued before the confirmation ends. */
        ...(replacePassword ? { sessionVersion: { increment: 1 } } : {}),
      },
    });
    const grant = await startTrialForVerifiedUser(tx, {
      userId: user.id,
      email: user.email,
      now,
    });
    await tx.verificationToken.deleteMany({ where: { identifier: email } });
    return {
      status: "verified" as const,
      trial: Boolean(grant),
      userId: user.id,
      sessionsRevoked: replacePassword,
    };
  });
  if (result.status === "verified" && result.sessionsRevoked) {
    forgetSessionState(result.userId);
    await revokeConnectorTokens(result.userId);
  }
  if (result.status === "verified") {
    await sendWelcomeEmail({
      userId: result.userId,
      email,
      trialStarted: result.trial,
    });
  }
  return { status: result.status, trial: result.trial };
}

/** Best effort: a failed welcome mail never undoes a confirmed address. */
async function sendWelcomeEmail(input: {
  userId: string;
  email: string;
  trialStarted: boolean;
}) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: input.userId },
      select: { name: true },
    });
    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXTAUTH_URL ||
      "http://localhost:3000";
    await EmailService.sendEmail({
      to: input.email,
      ...getWelcomeTemplate({
        name: user?.name || "there",
        appUrl: baseUrl,
        trialStarted: input.trialStarted,
      }),
    });
  } catch (error) {
    await logger.warn(
      "Welcome email failed",
      {
        userId: input.userId,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      LOG_SOURCE
    );
  }
}
