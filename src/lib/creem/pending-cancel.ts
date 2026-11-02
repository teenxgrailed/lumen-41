import { getCreemClient } from "@/lib/creem/client";
import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "CreemPendingCancel";

export const PENDING_CANCEL_BATCH = 25;
const BACKOFF_BASE_MS = 60_000;
const BACKOFF_MAX_MS = 6 * 60 * 60_000;

export function pendingCancelBackoffMs(attempts: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, attempts), BACKOFF_MAX_MS);
}

/** Creem answers 404, or a 4xx that says the subscription is already canceled. */
export function isAlreadyCanceled(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { statusCode, body, message } = error as {
    statusCode?: unknown;
    body?: unknown;
    message?: unknown;
  };
  if (statusCode === 404) return true;
  if (typeof statusCode !== "number" || statusCode >= 500) return false;
  const text = `${typeof body === "string" ? body : ""} ${
    typeof message === "string" ? message : ""
  }`;
  return /already[^a-z]+(cancel|expir)|not\s+active|cancell?ed/i.test(text);
}

/**
 * Cancels one superseded Pro subscription at Creem and settles the pending
 * marker on the row: cleared on success (including "already canceled"),
 * attempts and the next try pushed out with backoff on a real failure.
 */
export async function settlePendingCreemCancel(
  userId: string,
  creemSubscriptionId: string,
  priorAttempts = 0
): Promise<boolean> {
  try {
    await getCreemClient().subscriptions.cancel(creemSubscriptionId, {
      mode: "immediate",
    });
  } catch (error) {
    if (!isAlreadyCanceled(error)) {
      const attempts = priorAttempts + 1;
      await logger.error(
        "Could not cancel the Pro subscription superseded by Lifetime",
        {
          userId,
          creemSubscriptionId,
          attempts,
          error: error instanceof Error ? error.message : String(error),
        },
        LOG_SOURCE
      );
      try {
        await prisma.subscription.updateMany({
          where: { userId, pendingCreemCancelId: creemSubscriptionId },
          data: {
            pendingCreemCancelAttempts: attempts,
            pendingCreemCancelNextAt: newDate(
              newDate().getTime() + pendingCancelBackoffMs(priorAttempts)
            ),
          },
        });
      } catch (dbError) {
        await logger.error(
          "Could not record the failed Creem cancel retry",
          { userId, error: String(dbError) },
          LOG_SOURCE
        );
      }
      return false;
    }
    await logger.warn(
      "Superseded Pro subscription was already canceled at Creem",
      { userId, creemSubscriptionId },
      LOG_SOURCE
    );
  }

  await prisma.subscription.updateMany({
    where: { userId, pendingCreemCancelId: creemSubscriptionId },
    data: {
      pendingCreemCancelId: null,
      pendingCreemCancelAttempts: 0,
      pendingCreemCancelNextAt: null,
    },
  });
  return true;
}

/** Worker sweep: retry every due pending cancel until Creem confirms. */
export async function retryPendingCreemCancels(): Promise<number> {
  const now = newDate();
  const rows = await prisma.subscription.findMany({
    where: {
      pendingCreemCancelId: { not: null },
      OR: [
        { pendingCreemCancelNextAt: null },
        { pendingCreemCancelNextAt: { lte: now } },
      ],
    },
    select: {
      userId: true,
      pendingCreemCancelId: true,
      pendingCreemCancelAttempts: true,
    },
    orderBy: { updatedAt: "asc" },
    take: PENDING_CANCEL_BATCH,
  });
  let settled = 0;
  for (const row of rows) {
    if (!row.pendingCreemCancelId) continue;
    if (
      await settlePendingCreemCancel(
        row.userId,
        row.pendingCreemCancelId,
        row.pendingCreemCancelAttempts
      )
    ) {
      settled += 1;
    }
  }
  return settled;
}
