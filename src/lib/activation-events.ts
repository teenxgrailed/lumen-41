import { createHmac } from "crypto";

import { authSecret } from "@/lib/auth/auth-secret";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { sendUmamiEvent } from "@/lib/umami-server";

const LOG_SOURCE = "ActivationEvents";

/**
 * The six activation events behind the launch criterion (14.11.2026: by 30.11
 * fewer than 5 external users pressed Keep means the segment or onboarding
 * changes). Each is written to our own `ActivationEvent` table and sent to
 * Umami from the server code path that performs the action.
 */
export const ACTIVATION_EVENTS = [
  "account_created",
  "calendar_connected",
  "task_created",
  "replan_shown",
  "keep_applied",
  "undo_applied",
] as const;

export type ActivationEventName = (typeof ACTIVATION_EVENTS)[number];

/** Extra props: short ids and kinds only, never text, an address or a name. */
export type ActivationProps = Record<string, string | number | boolean>;

/** Admin accounts are the founder; their activity is flagged, not counted. */
export function isFounderRole(role: string | null | undefined): boolean {
  return role === "admin";
}

/**
 * A stable pseudonym for one account: HMAC-SHA256 of the id under the server
 * secret, truncated. It cannot be reversed or joined to an email, a name or an
 * IP without the secret, and it is the same on every event of the account.
 */
export function pseudonymousId(userId: string): string {
  return createHmac("sha256", authSecret())
    .update(`activation:${userId}`)
    .digest("hex")
    .slice(0, 16);
}

/**
 * The Umami payload of one activation event. Only the pseudonym, the founder
 * flag and the caller's own props: no email, name, IP, user id or text.
 */
export function buildActivationPayload(
  userId: string,
  isFounder: boolean,
  props: ActivationProps = {}
): Record<string, string | number | boolean> {
  return { ...props, uid: pseudonymousId(userId), isFounder };
}

async function record(
  name: ActivationEventName,
  userId: string,
  props: ActivationProps,
  once: boolean
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, sandboxKind: true },
  });
  /* Reviewer and demo logins are not people trying the product. */
  if (!user || user.sandboxKind) return;
  if (once) {
    const seen = await prisma.activationEvent.findFirst({
      where: { userId, name },
      select: { id: true },
    });
    if (seen) return;
  }
  await prisma.activationEvent.create({ data: { userId, name } });
  await sendUmamiEvent(
    name,
    buildActivationPayload(userId, isFounderRole(user.role), props),
    "app"
  );
}

/**
 * Record one activation event. Fire and forget: callers do not await it, and
 * a failure is only logged, so analytics can never break the action.
 * `once` keeps a single row per account (calendar_connected: the first
 * connection counts, later ones do not).
 */
export function recordActivation(
  name: ActivationEventName,
  userId: string | null | undefined,
  props: ActivationProps = {},
  options: { once?: boolean } = {}
): void {
  if (!userId) return;
  void record(name, userId, props, options.once ?? false).catch(
    (error: unknown) => {
      logger.warn(
        "Activation event failed",
        {
          name,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        LOG_SOURCE
      );
    }
  );
}
