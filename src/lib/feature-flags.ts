import type { SubscriptionPlan } from "@prisma/client";
import { createHash } from "crypto";

import { canUseAgentHub, canUseQuitHabits } from "@/lib/entitlements";
import {
  AGENT_HUB,
  AI_CHATGPT_PLAN,
  HABITS_QUIT,
} from "@/lib/feature-flags-keys";
import { prisma } from "@/lib/prisma";

export function rolloutBucket(flagKey: string, userId: string) {
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

/**
 * The agent hub is on for this account (server-side only; see `AGENT_HUB`):
 * the flag, and the plan check from `canUseAgentHub`. The flag is read first,
 * so an account without it never costs a plan lookup.
 */
export async function agentHubEnabled(userId: string) {
  if (!(await isFeatureEnabled(AGENT_HUB, userId))) return false;
  return (await canUseAgentHub(userId)).allowed;
}

/**
 * Needt AI on the person's own ChatGPT plan is on for this account: the
 * `ai_chatgpt_plan` flag. The deployment's `OPENAI_SIWC_CLIENT_ID` is checked
 * separately (`getChatGptPlanConfig`), and every caller needs both.
 */
export async function chatGptPlanFlagEnabled(userId: string) {
  return isFeatureEnabled(AI_CHATGPT_PLAN, userId);
}

/**
 * QUIT habits are available to this account: the `habits_quit` flag, then the
 * Pro check from `canUseQuitHabits` (a trial counts as Pro). The flag is read
 * first, so an account without it never costs a plan lookup.
 */
export async function quitHabitsEnabled(
  userId: string
): Promise<
  | { allowed: true }
  | { allowed: false; reason: "flag_off" }
  | { allowed: false; reason: "upgrade_required"; plan: SubscriptionPlan }
> {
  if (!(await isFeatureEnabled(HABITS_QUIT, userId))) {
    return { allowed: false, reason: "flag_off" };
  }
  const plan = await canUseQuitHabits(userId);
  if (!plan.allowed)
    return { allowed: false, reason: "upgrade_required", plan: plan.plan };
  return { allowed: true };
}
