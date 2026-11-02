import { createHmac } from "node:crypto";

import { authSecret } from "@/lib/auth/auth-secret";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "EmailSuppression";

export type SuppressionReason = "bounce" | "complaint" | "provider";

/** The address as it is compared: trimmed, lower-cased, no display name. */
export function normalizeMailbox(value: string): string {
  const bracket = /<([^<>]+)>\s*$/.exec(value.trim());
  return (bracket?.[1] ?? value).trim().toLowerCase();
}

/** HMAC of the normalised address. The address itself is not stored. */
export function suppressionKey(address: string): string {
  const key = createHmac("sha256", authSecret())
    .update("needt:email-suppression:v1")
    .digest();
  return createHmac("sha256", key)
    .update(normalizeMailbox(address))
    .digest("hex");
}

/**
 * True when optional mail to this address must be skipped. A lookup that fails
 * answers false: the caller is about to send, and the provider suppresses a
 * bounced address on its own side anyway.
 */
export async function isSuppressed(address: string): Promise<boolean> {
  try {
    const row = await prisma.emailSuppression.findUnique({
      where: { emailHash: suppressionKey(address) },
      select: { id: true },
    });
    return Boolean(row);
  } catch (error) {
    logger.warn(
      "Suppression lookup failed",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return false;
  }
}

/** Adds the address. Idempotent: a repeat keeps the first reason. */
export async function suppressAddress(
  address: string,
  reason: SuppressionReason,
  source = "resend-webhook"
): Promise<void> {
  const emailHash = suppressionKey(address);
  await prisma.emailSuppression.upsert({
    where: { emailHash },
    create: { emailHash, reason, source },
    update: {},
  });
}
