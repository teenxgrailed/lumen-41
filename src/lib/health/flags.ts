import { prisma } from "@/lib/prisma";

const AGENT_HUB_FLAG_KEY = "agent_hub";
const FLAG_CACHE_MS = 60_000;

let flagCache: {
  at: number;
  value: { enabled: boolean; rollout: number };
} | null = null;

/**
 * Global state of the agent hub flag for /api/health: the FeatureFlag row's
 * enabled and rolloutPercentage only, never per-user overrides or user ids.
 * One indexed lookup, cached for 60 seconds.
 */
export async function getAgentHubFlag() {
  if (flagCache && Date.now() - flagCache.at < FLAG_CACHE_MS) {
    return flagCache.value;
  }
  const row = await prisma.featureFlag.findUnique({
    where: { key: AGENT_HUB_FLAG_KEY },
    select: { enabled: true, rolloutPercentage: true },
  });
  const value = {
    enabled: row?.enabled ?? false,
    rollout: row?.rolloutPercentage ?? 0,
  };
  flagCache = { at: Date.now(), value };
  return value;
}

export function resetHealthFlagCacheForTests() {
  flagCache = null;
}
