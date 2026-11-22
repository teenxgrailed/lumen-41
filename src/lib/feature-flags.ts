import type { SubscriptionPlan } from "@prisma/client";
import { createHash } from "crypto";

import { canUseAgentHub, canUseQuitHabits } from "@/lib/entitlements";
import {
  AGENT_HUB,
  AI_CHATGPT_PLAN,
  ALWAYS_EASY_START,
  BUDGET_MODULE,
  DAY_PLAN,
  DAY_PLAN_TOUCHES,
  FOLDERS_V1,
  HABITS_CARDS_V1,
  HABITS_QUIT,
  HABIT_EVENING_PUSH,
  HOME_V2,
  SOMEDAY_SWEEP,
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
 * The Budget place is on for this account (`BUDGET_MODULE`). The plan is not
 * part of it: Free sees the place locked, so the flag alone decides.
 */
export async function budgetModuleEnabled(userId: string) {
  return isFeatureEnabled(BUDGET_MODULE, userId);
}

/** Home in three blocks (`HOME_V2`) is on for this account. */
export async function homeV2Enabled(userId: string) {
  return isFeatureEnabled(HOME_V2, userId);
}

/**
 * The Habits and Goals card screens (`HABITS_CARDS_V1`). Fails closed: a
 * missing session or a failed read is "off", so the old screens draw.
 */
export async function habitsCardsEnabled(userId: string | null | undefined) {
  if (!userId) return false;
  try {
    return await isFeatureEnabled(HABITS_CARDS_V1, userId);
  } catch {
    return false;
  }
}

/**
 * Projects as folders (`FOLDERS_V1`). Fails closed: no user, or a flag read
 * that throws, is off, and Projects keeps its cards.
 */
export async function foldersV1Enabled(userId: string | null | undefined) {
  if (!userId) return false;
  try {
    return await isFeatureEnabled(FOLDERS_V1, userId);
  } catch {
    return false;
  }
}

/** The 20:00 habit push is on for this account (`HABIT_EVENING_PUSH`). */
export async function habitEveningPushEnabled(userId: string) {
  return isFeatureEnabled(HABIT_EVENING_PUSH, userId);
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

/**
 * The day plan kill switch (`DAY_PLAN`). Fails closed: no user or a flag read
 * that throws is "off", so the plan touches, the sweep and the scheduler guard
 * all stand down and nothing about a person's tasks changes.
 */
export async function dayPlanEnabled(userId: string | null | undefined) {
  if (!userId) return false;
  try {
    return await isFeatureEnabled(DAY_PLAN, userId);
  } catch {
    return false;
  }
}

/** The day-plan touches: `day_plan` (kill switch) and `day_plan_touches`. */
export async function dayPlanTouchesEnabled(userId: string | null | undefined) {
  if (!userId) return false;
  try {
    return (
      (await isFeatureEnabled(DAY_PLAN, userId)) &&
      (await isFeatureEnabled(DAY_PLAN_TOUCHES, userId))
    );
  } catch {
    return false;
  }
}

/** The nightly Someday sweep is on for this account (`SOMEDAY_SWEEP`). */
export async function somedaySweepEnabled(userId: string | null | undefined) {
  if (!userId) return false;
  try {
    return await isFeatureEnabled(SOMEDAY_SWEEP, userId);
  } catch {
    return false;
  }
}

/**
 * Always easy start is on for this account: the `always_easy_start` kill
 * switch, then the person's own `UserSettings.alwaysEasyStart`. Fails closed:
 * no user, or a read that throws, is "off", so no task is ever changed on a
 * doubt. A person with no settings row yet has the default, on.
 */
export async function alwaysEasyStartEnabled(
  userId: string | null | undefined
) {
  if (!userId) return false;
  try {
    if (!(await isFeatureEnabled(ALWAYS_EASY_START, userId))) return false;
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
      select: { alwaysEasyStart: true },
    });
    return settings?.alwaysEasyStart ?? true;
  } catch {
    return false;
  }
}
