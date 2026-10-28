import { randomUUID } from "crypto";

import { newDate } from "@/lib/date-utils";
import { getPlan } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";
import {
  SANDBOX_AI_DAILY_ACTION_CAP,
  isSandboxUser,
} from "@/lib/sandbox/guard";

import { DEFAULT_HOSTED_AI_MODEL, resolveHostedAiEndpoint } from "./endpoint";
import { AIProviderUsage } from "./types";

export { DEFAULT_HOSTED_AI_MODEL };

const HOSTED_ENDPOINT = resolveHostedAiEndpoint(process.env);

export const HOSTED_AI_CONFIG = {
  monthlyActionCaps: {
    /**
     * A free account gets a small allowance rather than nothing. The agent is
     * the product's own headline, and a person who has never seen it work has
     * no reason to pay for it.
     */
    FREE: Number(process.env.NEEDT_AI_FREE_ACTION_CAP || 20),
    PRO: Number(process.env.NEEDT_AI_MONTHLY_ACTION_CAP || 300),
    LIFETIME: Number(process.env.NEEDT_AI_LIFETIME_ACTION_CAP || 300),
  },
  ceilingMultiplier: Number(process.env.NEEDT_AI_CEILING_MULTIPLIER || 2),
  baseUrl: HOSTED_ENDPOINT.baseUrl,
  model: HOSTED_ENDPOINT.model,
  /** Which kind of host `baseUrl` is; gateway routing only exists on OpenRouter. */
  hostKind: HOSTED_ENDPOINT.kind,
} as const;

/**
 * OpenRouter hosts that serve the default model and that OpenRouter's own
 * provider registry (`GET /api/v1/providers`) lists with headquarters in the
 * US or the EU and no datacenter outside them. Checked 2026-10-11 against
 * `GET /api/v1/models/z-ai/glm-5.3-flash/endpoints`.
 *
 * The owner's rule is that hosted AI requests are served only from the US or
 * the EU. OpenRouter has no per-request region filter (in-region routing is
 * the Business/Enterprise `eu.openrouter.ai` endpoint), so the rule is an
 * allow-list of named hosts. It only applies to the default model: another
 * model is served by other hosts, and a list that names none of them would
 * refuse every request, so a changed `NEEDT_AI_MODEL` needs its own
 * `NEEDT_AI_GATEWAY_PROVIDERS`.
 */
export const DEFAULT_MODEL_US_EU_PROVIDERS = [
  "atlas-cloud",
  "baseten",
  "coreweave",
  "crusoe",
  "decart",
  "deepinfra",
  "digitalocean",
  "fireworks",
  "friendli",
  "gmicloud",
  "inceptron",
  "inference-net",
  "modal",
  "morph",
  "novita",
  "open-inference",
  "parasail",
  "phala",
  "sail-research",
  "together",
  "venice",
  "wafer",
] as const;

/**
 * Hosts that serve the default model from outside the US and the EU, or whose
 * location OpenRouter does not publish: Z.AI (SG), StreamLake (CN),
 * SiliconFlow (SG), DekaLLM (ID), Relace, Reka and Near AI (none listed).
 * They are refused on every request, whatever the allow-list says, so an
 * allow-list typed by hand cannot reopen them.
 */
export const NON_US_EU_PROVIDERS = [
  "z-ai",
  "streamlake",
  "siliconflow",
  "dekallm",
  "relace",
  "reka",
  "near-ai",
] as const;

/**
 * Gateway routing for the hosted key.
 *
 * `data_collection: "deny"` keeps the request away from hosts that may retain
 * or train on it. `only` narrows routing to hosts in the US or the EU, and
 * `ignore` refuses the hosts known to be elsewhere even when `only` comes from
 * configuration.
 */
export function hostedAiRoutingBody(
  model: string = HOSTED_AI_CONFIG.model,
  hostKind: string = HOSTED_AI_CONFIG.hostKind
): Record<string, unknown> {
  // `provider` is an OpenRouter field. Another host (Z.ai directly) has no
  // such routing, and must not be sent options it would ignore or reject.
  if (hostKind !== "openrouter") return {};
  const configured = (process.env.NEEDT_AI_GATEWAY_PROVIDERS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const ignore: string[] = [...NON_US_EU_PROVIDERS];
  const allowed = configured.filter(
    (slug) => !ignore.includes(slug.split("/", 1)[0] ?? slug)
  );
  const allowList =
    allowed.length > 0
      ? allowed
      : model === DEFAULT_HOSTED_AI_MODEL
        ? [...DEFAULT_MODEL_US_EU_PROVIDERS]
        : [];
  const provider: Record<string, unknown> = {
    data_collection: "deny",
    ignore,
  };
  if (allowList.length > 0) provider.only = allowList;
  return { provider };
}

export type HostedAiUsageMode = "normal" | "slow" | "blocked";

export function hostedAiCeilingMultiplier(
  value = HOSTED_AI_CONFIG.ceilingMultiplier
) {
  return Number.isFinite(value) ? Math.max(1, value) : 2;
}

export function usageMonth(date = newDate()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0"
  )}`;
}

export function hostedUsageStatus(
  actionCount: number,
  plan: keyof typeof HOSTED_AI_CONFIG.monthlyActionCaps = "FREE",
  multiplier = hostedAiCeilingMultiplier(),
  /** Replaces the plan's cap (a sandbox account's small daily one). */
  limitOverride?: number
) {
  const limit = Math.max(
    0,
    limitOverride ?? HOSTED_AI_CONFIG.monthlyActionCaps[plan]
  );
  const used = Math.max(0, actionCount);
  const ceiling = Math.ceil(limit * hostedAiCeilingMultiplier(multiplier));
  const mode: HostedAiUsageMode =
    limit === 0 || used >= ceiling
      ? "blocked"
      : used >= limit
        ? "slow"
        : "normal";
  return {
    plan,
    used,
    limit,
    ceiling,
    remaining: Math.max(0, limit - used),
    allowed: mode !== "blocked",
    slowMode: mode === "slow",
    exhausted: mode === "blocked",
    mode,
  };
}

export function resolveAiAccessMode(input: {
  hasByok: boolean;
  hostedAvailable: boolean;
  hostedAllowed: boolean;
}) {
  if (input.hasByok) return "byok" as const;
  if (input.hostedAvailable && input.hostedAllowed) return "hosted" as const;
  return "none" as const;
}

/**
 * The plan and whether the account is a sandbox. A sandbox account
 * (docs/sandbox-accounts.md) gets `SANDBOX_AI_DAILY_ACTION_CAP` actions with
 * no slow lane: the nightly reset deletes its usage rows, so the month's
 * counter is in effect a day's.
 */
async function usagePolicy(userId: string) {
  const [plan, sandbox] = await Promise.all([
    getPlan(userId),
    isSandboxUser(userId),
  ]);
  return { plan, sandbox };
}

function usageStatusFor(
  actionCount: number,
  policy: Awaited<ReturnType<typeof usagePolicy>>
) {
  return policy.sandbox
    ? hostedUsageStatus(
        actionCount,
        policy.plan,
        1,
        SANDBOX_AI_DAILY_ACTION_CAP
      )
    : hostedUsageStatus(actionCount, policy.plan);
}

export async function getHostedAiUsage(userId: string) {
  const [row, policy] = await Promise.all([
    prisma.aiUsage.findUnique({
      where: { userId_yearMonth: { userId, yearMonth: usageMonth() } },
    }),
    usagePolicy(userId),
  ]);
  return usageStatusFor(row?.actionCount ?? 0, policy);
}

/**
 * What a client is allowed to learn about someone's hosted AI usage.
 *
 * The counts are deliberately absent from product surfaces, and
 * `scripts/check-ui-contracts.mjs` guards that. Sending them anyway only moved
 * the leak to the network tab, so the boundary drops them here instead: the UI
 * needs the mode, never the number.
 */
export function publicHostedAiUsage(
  status: Awaited<ReturnType<typeof getHostedAiUsage>>
) {
  return {
    plan: status.plan,
    allowed: status.allowed,
    slowMode: status.slowMode,
    exhausted: status.exhausted,
  };
}

export async function canUseHostedAi(userId: string) {
  return (await getHostedAiUsage(userId)).allowed;
}

export async function claimHostedAiAction(userId: string) {
  const yearMonth = usageMonth();
  const policy = await usagePolicy(userId);
  const status = usageStatusFor(0, policy);
  if (status.ceiling === 0) {
    return {
      claimed: false,
      mode: "blocked" as const,
      usage: status,
      yearMonth,
    };
  }

  const rows = await prisma.$queryRaw<Array<{ actionCount: number }>>`
    INSERT INTO "AiUsage" (
      "id", "userId", "yearMonth", "actionCount", "createdAt", "updatedAt"
    )
    VALUES (${randomUUID()}, ${userId}, ${yearMonth}, 1, NOW(), NOW())
    ON CONFLICT ("userId", "yearMonth") DO UPDATE
    SET
      "actionCount" = "AiUsage"."actionCount" + 1,
      "updatedAt" = NOW()
    WHERE "AiUsage"."actionCount" < ${status.ceiling}
    RETURNING "actionCount"
  `;

  const actionCount = rows[0]?.actionCount;
  if (actionCount === undefined) {
    const usage = usageStatusFor(status.ceiling, policy);
    return {
      claimed: false,
      mode: "blocked" as const,
      usage,
      yearMonth,
    };
  }

  const mode: HostedAiUsageMode =
    actionCount > status.limit ? "slow" : "normal";
  return {
    claimed: true,
    mode,
    usage: usageStatusFor(actionCount, policy),
    yearMonth,
  };
}

export async function releaseHostedAiAction(userId: string, yearMonth: string) {
  await prisma.$executeRaw`
    UPDATE "AiUsage"
    SET
      "actionCount" = GREATEST("actionCount" - 1, 0),
      "updatedAt" = NOW()
    WHERE
      "userId" = ${userId}
      AND "yearMonth" = ${yearMonth}
      AND "actionCount" > 0
  `;
}

function tokenCount(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

export async function recordHostedAiTokens(
  userId: string,
  usage: AIProviderUsage
) {
  const inputTokens = tokenCount(usage.inputTokens);
  const outputTokens = tokenCount(usage.outputTokens);
  if (inputTokens === 0 && outputTokens === 0) return;

  const yearMonth = usageMonth();
  await prisma.aiUsage.upsert({
    where: { userId_yearMonth: { userId, yearMonth } },
    create: { userId, yearMonth, inputTokens, outputTokens },
    update: {
      inputTokens: { increment: inputTokens },
      outputTokens: { increment: outputTokens },
    },
  });
}
