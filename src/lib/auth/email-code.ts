import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

import { authSecret } from "@/lib/auth/auth-secret";
import { addMinutes, newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

/**
 * Passwordless sign-in by a mailed code. The rules, in one place:
 *
 * - six digits from `crypto.randomInt`, never `Math.random`;
 * - stored only as an HMAC under the auth secret, bound to the address, so a
 *   read of the table is not a list of working codes;
 * - valid 10 minutes, one use, and it dies after 5 wrong tries;
 * - asking for a new code kills the older ones for that address;
 * - compared in constant time.
 *
 * A dedicated table rather than `VerificationToken`: that table has no
 * attempt counter, its `token` column is unique (a six-digit code would
 * collide across addresses), and the email-confirmation links live in it.
 */
export const EMAIL_CODE_LENGTH = 6;
export const EMAIL_CODE_TTL_MINUTES = 10;
export const EMAIL_CODE_MAX_ATTEMPTS = 5;
/** The client's resend countdown and the per-address send limit. */
export const EMAIL_CODE_RESEND_SECONDS = 60;

export function normalizeCodeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function generateEmailCode(): string {
  return String(randomInt(0, 10 ** EMAIL_CODE_LENGTH)).padStart(
    EMAIL_CODE_LENGTH,
    "0"
  );
}

export function hashEmailCode(email: string, code: string): string {
  return createHmac("sha256", authSecret())
    .update(`email-code:${normalizeCodeEmail(email)}:${code}`)
    .digest("hex");
}

/** Strips the spaces and dashes a person pastes; null unless six digits. */
export function cleanEmailCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const digits = input.replace(/[\s-]/g, "");
  return /^\d{6}$/.test(digits) ? digits : null;
}

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Makes a new code for the address, ending every earlier one. */
export async function issueEmailCode(
  email: string,
  now: Date = newDate()
): Promise<{ code: string; expiresAt: Date }> {
  const address = normalizeCodeEmail(email);
  const code = generateEmailCode();
  const expiresAt = addMinutes(now, EMAIL_CODE_TTL_MINUTES);
  await prisma.$transaction([
    prisma.emailLoginCode.deleteMany({
      where: { OR: [{ email: address }, { expiresAt: { lt: now } }] },
    }),
    prisma.emailLoginCode.create({
      data: {
        email: address,
        codeHash: hashEmailCode(address, code),
        expiresAt,
      },
      select: { id: true },
    }),
  ]);
  return { code, expiresAt };
}

/** Drops a code whose mail could not be sent. */
export async function discardEmailCodes(email: string): Promise<void> {
  await prisma.emailLoginCode.deleteMany({
    where: { email: normalizeCodeEmail(email) },
  });
}

export type EmailCodeCheck =
  | { status: "ok"; id: string }
  /* A live code, and this was not it: counted toward the daily lock. */
  | { status: "wrong" }
  | { status: "invalid" };

/**
 * Whether `code` is the live code of the address. Counts the try first (an
 * atomic, capped increment, so parallel guesses cannot exceed the cap), then
 * compares. A right code is given its try back and is NOT spent here: the
 * caller spends it with `consumeEmailCode` once the rest of the sign-in
 * (age confirmation for a new account) is known to be able to finish.
 */
export async function checkEmailCode(
  email: string,
  code: string,
  now: Date = newDate()
): Promise<EmailCodeCheck> {
  const address = normalizeCodeEmail(email);
  const live = await prisma.emailLoginCode.findFirst({
    where: { email: address, consumedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
    select: { id: true, codeHash: true },
  });
  if (!live) return { status: "invalid" };

  const counted = await prisma.emailLoginCode.updateMany({
    where: {
      id: live.id,
      consumedAt: null,
      expiresAt: { gt: now },
      attempts: { lt: EMAIL_CODE_MAX_ATTEMPTS },
    },
    data: { attempts: { increment: 1 } },
  });
  if (counted.count !== 1) return { status: "invalid" };

  if (!sameHash(live.codeHash, hashEmailCode(address, code))) {
    /* The last wrong try ends the code. */
    await prisma.emailLoginCode.deleteMany({
      where: { id: live.id, attempts: { gte: EMAIL_CODE_MAX_ATTEMPTS } },
    });
    return { status: "wrong" };
  }
  await prisma.emailLoginCode.updateMany({
    where: { id: live.id, attempts: { gt: 0 } },
    data: { attempts: { decrement: 1 } },
  });
  return { status: "ok", id: live.id };
}

/** Spends the code. False when someone else spent it first. */
export async function consumeEmailCode(
  id: string,
  now: Date = newDate()
): Promise<boolean> {
  const spent = await prisma.emailLoginCode.updateMany({
    where: { id, consumedAt: null, expiresAt: { gt: now } },
    data: { consumedAt: now },
  });
  return spent.count === 1;
}
