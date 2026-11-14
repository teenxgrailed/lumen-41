import { Prisma } from "@prisma/client";

import { requestUtm } from "@/lib/attribution-server";
import {
  checkEmailCode,
  cleanEmailCode,
  consumeEmailCode,
  discardEmailCodes,
  generateEmailCode,
  hashEmailCode,
  issueEmailCode,
  normalizeCodeEmail,
} from "@/lib/auth/email-code";
import {
  isEmailCodeLocked,
  recordWrongEmailCode,
} from "@/lib/auth/email-code-lock";
import { newAccountDefaults } from "@/lib/auth/new-account";
import { isPublicSignupEnabled } from "@/lib/auth/public-signup";
import { areSignupsOpen } from "@/lib/auth/signups";
import {
  claimUnconfirmedAccountByProvider,
  isUnprovenPasswordAccount,
} from "@/lib/auth/unproven-password";
import { newDate } from "@/lib/date-utils";
import { EmailService } from "@/lib/email/email-service";
import { getEmailCodeTemplate } from "@/lib/email/templates/email-code";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { markEmailVerifiedAndStartTrial } from "@/lib/trials/trial-service";
import { sendUmamiSignupCompleted } from "@/lib/umami-server";

const LOG_SOURCE = "EmailCodeService";

/** Thrown from `authorize`; NextAuth hands the message back as the error. */
export const AGE_CONFIRM_REQUIRED_ERROR = "AgeConfirmRequired";

/** The provider id: the NextAuth credentials provider and the Umami method. */
export const EMAIL_CODE_PROVIDER = "email-code";

async function findUserByEmail(email: string) {
  return prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      sandboxKind: true,
      emailVerified: true,
      accounts: {
        where: { provider: "credentials" },
        select: { provider: true, id_token: true },
      },
    },
  });
}

/**
 * Mails a code, when this address may sign in or sign up. The caller answers
 * the same whatever this returns, so nobody learns whether an account exists:
 * "skipped" is a sandbox or deactivated account, or a new address while
 * sign-up is closed, and nothing is sent.
 */
export async function sendLoginCode(
  rawEmail: string
): Promise<"sent" | "skipped"> {
  const email = normalizeCodeEmail(rawEmail);
  const user = await findUserByEmail(email);
  let skip: string | null = null;
  if (user) {
    if (!user.isActive || user.sandboxKind) {
      skip = "account may not use codes";
    }
  } else if (!(await areSignupsOpen()) || !(await isPublicSignupEnabled())) {
    skip = "sign-up is closed";
  }
  if (!skip && (await isEmailCodeLocked(email))) {
    skip = "too many wrong codes today";
  }
  if (skip) {
    /* Best effort against a timing oracle: the same HMAC and a database read
       the real path does, so a refusal is not much quicker than a send. */
    hashEmailCode(email, generateEmailCode());
    await prisma.emailLoginCode.findFirst({
      where: { email },
      select: { id: true },
    });
    logger.info(`Login code not sent: ${skip}`, {}, LOG_SOURCE);
    return "skipped";
  }

  const { code } = await issueEmailCode(email);
  try {
    await EmailService.sendEmail({
      to: email,
      ...getEmailCodeTemplate({ code }),
    });
  } catch (error) {
    await discardEmailCodes(email);
    throw error;
  }
  logger.info("Login code sent", {}, LOG_SOURCE);
  return "sent";
}

export interface EmailCodeUser {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
  /** This sign-in created the account. */
  isNew: boolean;
}

/**
 * The NextAuth `authorize` of the "email-code" provider. A right code proves
 * the inbox, so the address is confirmed and the trial starts through the
 * same function the OAuth path uses. Null for every refusal (wrong, expired,
 * spent or dead code; sandbox or deactivated account; closed sign-up), so
 * the response never says which. The one thrown error is a new account
 * without the 16+ / Terms confirmation; it is raised before the code is
 * spent, so the person can tick the box and use the same code.
 */
export async function authorizeEmailCode(input: {
  email?: unknown;
  code?: unknown;
  ageConfirmed?: unknown;
  timeZone?: unknown;
  locale?: unknown;
}): Promise<EmailCodeUser | null> {
  if (typeof input.email !== "string") return null;
  const email = normalizeCodeEmail(input.email);
  const code = cleanEmailCode(input.code);
  if (!email || !code) return null;

  if (await isEmailCodeLocked(email)) return null;
  const checked = await checkEmailCode(email, code);
  if (checked.status === "wrong") await recordWrongEmailCode(email);
  if (checked.status !== "ok") return null;

  const existing = await findUserByEmail(email);
  if (existing) {
    if (!existing.isActive || existing.sandboxKind) return null;
  } else {
    if (!(await areSignupsOpen()) || !(await isPublicSignupEnabled())) {
      return null;
    }
    if (input.ageConfirmed !== true && input.ageConfirmed !== "true") {
      throw new Error(AGE_CONFIRM_REQUIRED_ERROR);
    }
  }

  if (!(await consumeEmailCode(checked.id))) return null;

  const now = newDate();
  if (existing) return signInExisting(existing, email, now);

  let created: {
    id: string;
    email: string | null;
    name: string | null;
    role: string;
  };
  try {
    created = await prisma.user.create({
      data: {
        email,
        name: email.split("@")[0],
        emailVerified: now,
        ageConfirmedAt: now,
        lastAuthenticatedAt: now,
        ...newAccountDefaults(input),
      },
      select: { id: true, email: true, name: true, role: true },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      /* The address was taken between the lookup and the insert. Whoever won
         made the account some other way, so this is a sign-in to an existing
         account and gets the full existing-account treatment. */
      const winner = await findUserByEmail(email);
      if (!winner || !winner.isActive || winner.sandboxKind) return null;
      return signInExisting(winner, email, now);
    }
    throw error;
  }
  await markEmailVerifiedAndStartTrial({
    userId: created.id,
    email,
    now,
  });
  /* Once per account: only the branch that created the row gets here. */
  void sendUmamiSignupCompleted(EMAIL_CODE_PROVIDER, await requestUtm());
  return { ...created, isNew: true };
}

type ExistingUser = NonNullable<Awaited<ReturnType<typeof findUserByEmail>>>;

/** A right code for an account that exists: confirm it, start its trial. */
async function signInExisting(
  existing: ExistingUser,
  email: string,
  now: Date
): Promise<EmailCodeUser> {
  if (isUnprovenPasswordAccount(existing)) {
    /* Whoever registered this address with a password never proved the
       inbox; the code does, so that password is wiped and every earlier
       session ends (unproven-password.ts). */
    await claimUnconfirmedAccountByProvider({
      userId: existing.id,
      provider: EMAIL_CODE_PROVIDER,
      now,
    });
  }
  if (!existing.emailVerified) {
    await markEmailVerifiedAndStartTrial({
      userId: existing.id,
      email: existing.email ?? email,
      now,
    });
  }
  await prisma.user.update({
    where: { id: existing.id },
    data: { lastAuthenticatedAt: now },
    select: { id: true },
  });
  return {
    id: existing.id,
    email: existing.email,
    name: existing.name,
    role: existing.role,
    isNew: false,
  };
}
