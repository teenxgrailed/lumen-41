import { AIProvider } from "@prisma/client";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import {
  CHATGPT_PLAN_MANAGE_USAGE_URL,
  chatGptPlanAvailable,
} from "./chatgpt-plan/config";
import { getChatGptPlanAccessToken } from "./chatgpt-plan/oauth";
import { ChatGptPlanProvider } from "./chatgpt-plan/provider";
import { decryptSecret } from "./encryption";
import { getCustomAIOAuthAccessToken, getCustomAIOAuthConfig } from "./oauth";
import type { AiProviderChoice, AiProviderReport } from "./provider-choice";
import { createSchedulerAI } from "./providers";
import { waitForHostedAiSlot } from "./slow-queue";
import {
  AIProviderName,
  AIProviderUsage,
  SchedulerAI,
  SchedulerAIConfig,
} from "./types";
import {
  HOSTED_AI_CONFIG,
  claimHostedAiAction,
  getHostedAiUsage,
  hostedAiRoutingBody,
  publicHostedAiUsage,
  recordHostedAiTokens,
  releaseHostedAiAction,
  resolveAiAccessMode,
} from "./usage";

const LOG_SOURCE = "AISettings";

// Hosted AI is metered in actions; token counts are recorded alongside them
// so the deployment can see what the hosted provider actually costs.
async function recordProviderUsage(
  userId: string,
  providerUsage: AIProviderUsage
) {
  try {
    await recordHostedAiTokens(userId, providerUsage);
  } catch (error) {
    logger.warn(
      "Failed to record hosted AI token usage",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
  }
}

export function getDefaultCustomAIUrl() {
  return process.env.AI_CUSTOM_URL?.trim() || null;
}

export async function ensureAISettings(userId: string) {
  return prisma.aISettings.upsert({
    where: { userId },
    update: {},
    create: {
      userId,
      provider: "NONE",
      allowParseTasks: true,
      allowReorder: false,
      allowSuggestEnergy: true,
      allowFullAuto: false,
      requestTimeoutSeconds: 20,
      customUrl: getDefaultCustomAIUrl(),
    },
  });
}

export function publicAISettings(
  settings: Awaited<ReturnType<typeof ensureAISettings>>,
  oauth?: {
    available: boolean;
    connected: boolean;
    expiresAt: string | null;
  }
) {
  return {
    provider: settings.provider,
    hasApiKey: Boolean(getEncryptedKeyForProvider(settings, settings.provider)),
    providerKeys: {
      ANTHROPIC: Boolean(settings.encryptedAnthropicKey),
      OPENAI: Boolean(settings.encryptedOpenAIKey),
      GROK: Boolean(settings.encryptedGrokKey),
      GLM: Boolean(settings.encryptedGlmKey),
      CUSTOM: Boolean(settings.encryptedApiKey),
    },
    customUrl: settings.customUrl || getDefaultCustomAIUrl(),
    model: settings.model,
    soulPreset: settings.soulPreset,
    allowParseTasks: settings.allowParseTasks,
    allowReorder: settings.allowReorder,
    allowSuggestEnergy: settings.allowSuggestEnergy,
    allowFullAuto: settings.allowFullAuto,
    requestTimeoutSeconds: settings.requestTimeoutSeconds,
    hostedAvailable: Boolean(process.env.NEEDT_AI_API_KEY?.trim()),
    oauth: oauth || {
      available: false,
      connected: false,
      expiresAt: null,
    },
  };
}

export async function publicAISettingsWithOAuth(
  settings: Awaited<ReturnType<typeof ensureAISettings>>
) {
  const connection = await prisma.aIOAuthConnection.findUnique({
    where: {
      userId_provider: { userId: settings.userId, provider: AIProvider.CUSTOM },
    },
  });

  let available = false;
  try {
    available = Boolean(getCustomAIOAuthConfig());
  } catch {
    // Bad deployment configuration must not make the whole settings page fail.
  }

  return {
    ...publicAISettings(settings, {
      available,
      connected: Boolean(connection),
      expiresAt: connection?.expiresAt?.toISOString() || null,
    }),
    usage: publicHostedAiUsage(await getHostedAiUsage(settings.userId)),
  };
}

export function getEncryptedKeyForProvider(
  settings: Awaited<ReturnType<typeof ensureAISettings>>,
  provider: AIProvider | string
) {
  switch (provider) {
    case AIProvider.ANTHROPIC:
      return settings.encryptedAnthropicKey || settings.encryptedApiKey;
    case AIProvider.OPENAI:
      return settings.encryptedOpenAIKey || settings.encryptedApiKey;
    case AIProvider.GROK:
      return settings.encryptedGrokKey;
    case AIProvider.GLM:
      return settings.encryptedGlmKey;
    case AIProvider.CUSTOM:
      return settings.encryptedApiKey;
    default:
      return null;
  }
}

export function defaultModelForProvider(provider: AIProvider | string) {
  switch (provider) {
    case AIProvider.ANTHROPIC:
      return "claude-sonnet-4-6";
    case AIProvider.OPENAI:
      return "gpt-4o";
    case AIProvider.GROK:
      return "grok-2-latest";
    case AIProvider.GLM:
      return "glm-4.5";
    default:
      return null;
  }
}

async function resolveNeedtAI(userId: string) {
  const settings = await ensureAISettings(userId);
  let oauthToken: string | null = null;
  if (settings.provider === AIProvider.CUSTOM) {
    try {
      oauthToken = await getCustomAIOAuthAccessToken(userId);
    } catch {
      // OAuth is optional. Key-based Custom AI and deterministic scheduling stay
      // available even if an administrator misconfigures its OAuth endpoint.
    }
  }
  const byokKey =
    oauthToken ||
    decryptSecret(getEncryptedKeyForProvider(settings, settings.provider));
  const hostedKey = process.env.NEEDT_AI_API_KEY?.trim() || null;
  const usage = await getHostedAiUsage(userId);
  const source = resolveAiAccessMode({
    // A key the person pays for costs us nothing, so the plan does not gate it.
    hasByok: Boolean(byokKey),
    hostedAvailable: Boolean(hostedKey),
    hostedAllowed: usage.allowed,
  });
  const config: SchedulerAIConfig =
    source === "hosted"
      ? {
          provider: "OPENAI",
          apiKey: hostedKey,
          baseUrl: HOSTED_AI_CONFIG.baseUrl,
          model: HOSTED_AI_CONFIG.model,
          extraBody: hostedAiRoutingBody(),
          timeoutMs: settings.requestTimeoutSeconds * 1000,
          soulPreset: settings.soulPreset === "coach" ? "coach" : "business",
          onUsage: (providerUsage) =>
            recordProviderUsage(userId, providerUsage),
        }
      : {
          provider:
            source === "byok" ? (settings.provider as AIProviderName) : "NONE",
          apiKey: byokKey,
          customUrl: settings.customUrl || getDefaultCustomAIUrl(),
          model: settings.model || defaultModelForProvider(settings.provider),
          timeoutMs: settings.requestTimeoutSeconds * 1000,
          soulPreset:
            settings.soulPreset === "coach" ||
            settings.soulPreset === "business"
              ? settings.soulPreset
              : "business",
        };

  return {
    settings,
    ai: createSchedulerAI(config),
    source: source as "byok" | "hosted" | "none" | "chatgpt_plan",
    usage,
    config,
    providerReport: null as AiProviderReport | null,
  };
}

/**
 * Needt AI on the person's own ChatGPT plan, when the request asks for it
 * (`provider: "chatgpt_plan"`), the `ai_chatgpt_plan` flag is on for them and
 * the deployment has `OPENAI_SIWC_CLIENT_ID`. In every other case this is
 * exactly `resolveNeedtAI`, with no report, so a deployment with the feature
 * off shows no trace of it.
 *
 * If the plan connection is missing or unusable up front, Needt AI answers
 * (their own key first, else the hosted quota) and the report says so. A
 * failure after the request starts is handled by `ChatGptPlanProvider`.
 */
export async function getConfiguredSchedulerAI(
  userId: string,
  options: { provider?: AiProviderChoice } = {}
) {
  const needt = await resolveNeedtAI(userId);
  if (options.provider !== "chatgpt_plan") return needt;
  const planConfig = await chatGptPlanAvailable(userId);
  if (!planConfig) return needt;

  const token = await getChatGptPlanAccessToken(userId);
  if (!token.ok) {
    const state =
      needt.source !== "none"
        ? undefined
        : token.reason === "revoked"
          ? ("reconnect_required" as const)
          : token.reason === "unavailable"
            ? ("plan_unavailable" as const)
            : undefined;
    const report: AiProviderReport = {
      requested: "chatgpt_plan",
      used: needt.source === "none" ? "none" : "needt",
      fallback: {
        reason: token.reason,
        // A hosted answer is claimed (counted) by getPreparedSchedulerAI.
        charged: needt.source === "hosted",
      },
      state,
      manageUsageUrl: CHATGPT_PLAN_MANAGE_USAGE_URL,
    };
    return { ...needt, providerReport: report };
  }

  const report: AiProviderReport = {
    requested: "chatgpt_plan",
    used: "chatgpt_plan",
    fallback: null,
    manageUsageUrl: CHATGPT_PLAN_MANAGE_USAGE_URL,
  };
  const fallback = async () => {
    if (needt.source === "byok") {
      return { ai: createSchedulerAI(needt.config), charged: false };
    }
    if (needt.source !== "hosted") return null;
    const claim = await claimHostedAiAction(userId);
    if (!claim.claimed) return null;
    if (claim.mode === "slow") {
      try {
        await waitForHostedAiSlot(userId);
      } catch {
        await releaseHostedAiAction(userId, claim.yearMonth).catch(() => {});
        return null;
      }
    }
    return { ai: createSchedulerAI(needt.config), charged: true };
  };
  return {
    ...needt,
    ai: new ChatGptPlanProvider({
      userId,
      config: planConfig,
      report,
      fallback,
    }) as SchedulerAI,
    source: "chatgpt_plan" as "byok" | "hosted" | "none" | "chatgpt_plan",
    providerReport: report as AiProviderReport | null,
  };
}

export async function getPreparedSchedulerAI(
  userId: string,
  existing?: Awaited<ReturnType<typeof getConfiguredSchedulerAI>>
) {
  const configured = existing ?? (await getConfiguredSchedulerAI(userId));
  if (configured.source !== "hosted") {
    return { ...configured, hostedMode: null };
  }

  let queued = false;
  if (configured.usage.slowMode) {
    await waitForHostedAiSlot(userId);
    queued = true;
  }

  const claim = await claimHostedAiAction(userId);
  if (!claim.claimed) {
    if (configured.providerReport) {
      // Nothing answered and nothing was charged.
      configured.providerReport.used = "none";
      if (configured.providerReport.fallback) {
        configured.providerReport.fallback.charged = false;
      }
    }
    return {
      ...configured,
      ai: createSchedulerAI({ provider: "NONE" }),
      source: "none" as const,
      usage: claim.usage,
      hostedMode: "blocked" as const,
    };
  }

  if (claim.mode === "slow") {
    if (!queued) {
      try {
        await waitForHostedAiSlot(userId);
      } catch (error) {
        try {
          await releaseHostedAiAction(userId, claim.yearMonth);
        } catch (releaseError) {
          await logger.error(
            "Failed to release hosted AI claim after queue failure",
            {
              userId,
              error:
                releaseError instanceof Error
                  ? releaseError.message
                  : String(releaseError),
            },
            LOG_SOURCE
          );
        }
        throw error;
      }
    }
    const hostedKey = process.env.NEEDT_AI_API_KEY?.trim() || null;
    const config: SchedulerAIConfig = {
      provider: "OPENAI",
      apiKey: hostedKey,
      baseUrl: HOSTED_AI_CONFIG.baseUrl,
      model: HOSTED_AI_CONFIG.model,
      extraBody: hostedAiRoutingBody(),
      timeoutMs: configured.settings.requestTimeoutSeconds * 1000,
      soulPreset:
        configured.settings.soulPreset === "coach" ? "coach" : "business",
      maxTokens: 600,
    };
    return {
      ...configured,
      ai: createSchedulerAI(config),
      usage: claim.usage,
      hostedMode: claim.mode,
    };
  }

  return {
    ...configured,
    usage: claim.usage,
    hostedMode: claim.mode,
  };
}
