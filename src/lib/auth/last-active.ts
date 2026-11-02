import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "LastActive";
const HOUR_MS = 60 * 60 * 1000;
const MAX_REMEMBERED = 5000;

/** Per process, so a busy session does not even reach the database. */
const lastTouch = new Map<string, number>();

/**
 * Records that the person used the app, at most once an hour. Win-back mail
 * and the quarterly check read `User.lastActiveAt`. The database write is
 * conditional (never earlier than an hour after the stored value), so several
 * server processes cannot write more often than that either. A failure is
 * logged and never breaks the request.
 */
export async function touchLastActive(
  userId: string,
  now: Date = newDate()
): Promise<void> {
  const at = now.getTime();
  const seen = lastTouch.get(userId);
  if (seen !== undefined && at - seen < HOUR_MS) return;
  if (lastTouch.size >= MAX_REMEMBERED) lastTouch.clear();
  lastTouch.set(userId, at);
  try {
    await prisma.user.updateMany({
      where: {
        id: userId,
        OR: [
          { lastActiveAt: null },
          { lastActiveAt: { lt: newDate(at - HOUR_MS) } },
        ],
      },
      data: { lastActiveAt: now },
    });
  } catch (error) {
    await logger.warn(
      "Could not record last activity",
      { error: error instanceof Error ? error.message : "Unknown" },
      LOG_SOURCE
    );
  }
}

/** For tests. */
export function resetLastActiveMemory(): void {
  lastTouch.clear();
}
