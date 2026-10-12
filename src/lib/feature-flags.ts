import { createHash } from "crypto";

import { prisma } from "@/lib/prisma";

function rolloutBucket(flagKey: string, userId: string) {
  const digest = createHash("sha256").update(`${flagKey}:${userId}`).digest();
  return digest.readUInt32BE(0) % 100;
}

export async function isFeatureEnabled(flagKey: string, userId: string) {
  const flag = await prisma.featureFlag.findUnique({
    where: { key: flagKey },
    include: {
      overrides: {
        where: { userId },
        select: { enabled: true },
        take: 1,
      },
    },
  });
  const override = flag?.overrides[0];
  if (override) return override.enabled;
  if (!flag?.enabled) return false;
  return rolloutBucket(flagKey, userId) < flag.rolloutPercentage;
}

/**
 * For checks that have no user yet (a sign-up, a first OAuth return): a flag
 * is on for an anonymous caller only when it is enabled for everybody. There
 * is no bucket to hash and no override to read, so a partial rollout counts
 * as off.
 */
export async function isFeatureEnabledForEveryone(flagKey: string) {
  const flag = await prisma.featureFlag.findUnique({
    where: { key: flagKey },
    select: { enabled: true, rolloutPercentage: true },
  });
  return Boolean(flag?.enabled) && (flag?.rolloutPercentage ?? 0) >= 100;
}
