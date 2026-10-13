import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { cleanupUnusedClients } from "./clients";

const LOG_SOURCE = "OAuthCleanup";
const DAY_MS = 24 * 60 * 60 * 1000;

/** Revoked and expired rows are kept this long for the audit trail. */
const KEEP_ENDED_MS = 30 * DAY_MS;
/** A CIMD client nobody holds a token for is forgotten after this long. */
const STALE_CIMD_MS = 30 * DAY_MS;

/**
 * Hourly sweep run by the worker: codes that expired or were used, tokens
 * that ended a month ago, dynamically registered clients that never got a
 * token, and CIMD clients nobody uses any more (they are re-fetched on the
 * next authorization).
 */
export async function cleanupOAuth(now = newDate()) {
  const t = now.getTime();
  const [codes, tokens, dcrClients, cimdClients] = await Promise.all([
    prisma.oAuthAuthorizationCode.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date(t - DAY_MS) } },
          { usedAt: { lt: new Date(t - DAY_MS) } },
        ],
      },
    }),
    prisma.oAuthToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date(t - KEEP_ENDED_MS) } },
          { revokedAt: { lt: new Date(t - KEEP_ENDED_MS) } },
        ],
      },
    }),
    cleanupUnusedClients(now),
    prisma.oAuthClient.deleteMany({
      where: {
        kind: "cimd",
        tokens: { none: { revokedAt: null, expiresAt: { gt: now } } },
        OR: [
          { lastUsedAt: null, createdAt: { lt: new Date(t - STALE_CIMD_MS) } },
          { lastUsedAt: { lt: new Date(t - STALE_CIMD_MS) } },
        ],
      },
    }),
  ]);
  const counts = {
    codes: codes.count,
    tokens: tokens.count,
    dcrClients,
    cimdClients: cimdClients.count,
  };
  if (Object.values(counts).some(Boolean)) {
    await logger.info("OAuth cleanup", counts, LOG_SOURCE);
  }
  return counts;
}
