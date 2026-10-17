import { Prisma, SubscriptionPlan } from "@prisma/client";
import { createHmac } from "node:crypto";

import { NEEDT_PRICING } from "@/lib/creem/config";
import { addCalendarDays, newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "TrialService";

export const TRIAL_DURATION_DAYS = NEEDT_PRICING.trialDays;

type TrialTransaction = Prisma.TransactionClient;

export async function runTrialTransaction<T>(
  operation: (tx: TrialTransaction) => Promise<T>
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (
        attempt < 2 &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034"
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new Error("Trial transaction retry limit reached");
}

export function normalizeTrialEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  const at = normalized.lastIndexOf("@");
  if (at <= 0 || at === normalized.length - 1) return normalized;

  let local = normalized.slice(0, at);
  let domain = normalized.slice(at + 1);
  if (domain === "gmail.com" || domain === "googlemail.com") {
    local = local.split("+", 1)[0].replaceAll(".", "");
    domain = "gmail.com";
  }
  return `${local}@${domain}`;
}

/**
 * The key that makes a trial one-per-email without keeping the email.
 *
 * It is an HMAC of the normalized address under a key derived from
 * `RATE_LIMIT_HASH_SECRET`, so the table answers "has this address had a
 * trial" and nothing else: without the server secret a leaked row cannot be
 * turned back into an address or checked against a list of guesses. Rotating
 * that secret makes every earlier address eligible for one more trial.
 */
export function trialEmailKey(email: string): string {
  const secret = process.env.RATE_LIMIT_HASH_SECRET;
  if (!secret) {
    throw new Error("RATE_LIMIT_HASH_SECRET is required.");
  }
  const derivedKey = createHmac("sha256", secret)
    .update("needt:trial-email-key:v1")
    .digest();
  return createHmac("sha256", derivedKey)
    .update(normalizeTrialEmail(email))
    .digest("hex");
}

/**
 * True when this account could still be given a trial: nobody, under this
 * address or this account, has had one. A read, for the paywall's button; the
 * grant itself is `startTrialForVerifiedUser`, which decides again inside its
 * transaction.
 */
export async function isTrialAvailable(input: {
  userId: string;
  email: string;
}): Promise<boolean> {
  const emailKey = trialEmailKey(input.email);
  const legacyEmailKey = normalizeTrialEmail(input.email);
  const used = await prisma.trialGrant.findFirst({
    where: {
      OR: [
        { userId: input.userId },
        { emailKey: { in: [emailKey, legacyEmailKey] } },
      ],
    },
    select: { id: true },
  });
  return !used;
}

export async function startTrialForVerifiedUser(
  tx: TrialTransaction,
  input: { userId: string; email: string; now?: Date }
) {
  const now = input.now ?? newDate();
  const emailKey = trialEmailKey(input.email);
  /* A grant made before keys were hashed holds the normalized address until
     `hashLegacyTrialEmailKeys` rewrites it, and it still spends the trial. */
  const legacyEmailKey = normalizeTrialEmail(input.email);
  const endsAt = addCalendarDays(now, TRIAL_DURATION_DAYS);

  await tx.subscription.upsert({
    where: { userId: input.userId },
    update: {},
    create: {
      userId: input.userId,
      plan: SubscriptionPlan.FREE,
    },
  });
  const existing = await tx.trialGrant.findFirst({
    where: { emailKey: { in: [emailKey, legacyEmailKey] } },
  });
  if (existing) return existing.userId === input.userId ? existing : null;

  await tx.trialGrant.createMany({
    data: {
      emailKey,
      userId: input.userId,
      startedAt: now,
      endsAt,
    },
    skipDuplicates: true,
  });

  const grant = await tx.trialGrant.findUnique({ where: { emailKey } });
  return grant?.userId === input.userId ? grant : null;
}

/**
 * Rewrites grants that still hold a plaintext address as their key. Every key
 * written by `trialEmailKey` is hex, so an `@` marks exactly the rows left to
 * do; the sweep is idempotent and costs one indexed-table scan once done.
 */
export async function hashLegacyTrialEmailKeys(batchSize = 500) {
  let rewritten = 0;
  while (true) {
    const rows = await prisma.trialGrant.findMany({
      where: { emailKey: { contains: "@" } },
      select: { id: true, emailKey: true },
      take: batchSize,
    });
    if (rows.length === 0) break;
    for (const row of rows) {
      try {
        await prisma.trialGrant.update({
          where: { id: row.id },
          data: { emailKey: trialEmailKey(row.emailKey) },
        });
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== "P2002"
        ) {
          throw error;
        }
        /* The address already has a hashed grant, written while an older
           release was still running. That grant keeps blocking the address;
           this one keeps its user's trial under a key that names no one. */
        await prisma.trialGrant.update({
          where: { id: row.id },
          data: { emailKey: `superseded:${row.id}` },
        });
      }
      rewritten += 1;
    }
    if (rows.length < batchSize) break;
  }
  if (rewritten > 0) {
    await logger.info(
      "Hashed legacy trial email keys",
      { rewritten },
      LOG_SOURCE
    );
  }
  return rewritten;
}

export async function markEmailVerifiedAndStartTrial(input: {
  userId: string;
  email: string;
  now?: Date;
}) {
  return runTrialTransaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: input.userId },
      data: { emailVerified: input.now ?? newDate() },
      select: { id: true, email: true, emailVerified: true },
    });
    if (!user.email) return { user, trial: null };
    const trial = await startTrialForVerifiedUser(tx, {
      userId: user.id,
      email: user.email,
      now: input.now,
    });
    return { user, trial };
  });
}
