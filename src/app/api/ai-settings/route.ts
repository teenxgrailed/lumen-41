import { NextRequest, NextResponse } from "next/server";

import { encryptSecret } from "@/services/ai/encryption";
import {
  defaultModelForProvider,
  ensureAISettings,
  getDefaultCustomAIUrl,
  publicAISettingsWithOAuth,
} from "@/services/ai/settings";
import { AIProvider } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "ai-settings-api";

function isProvider(value: unknown): value is AIProvider {
  return (
    value === "NONE" ||
    value === "ANTHROPIC" ||
    value === "OPENAI" ||
    value === "GROK" ||
    value === "GLM" ||
    value === "CUSTOM"
  );
}

function encryptedKeyField(provider: AIProvider) {
  switch (provider) {
    case AIProvider.ANTHROPIC:
      return "encryptedAnthropicKey";
    case AIProvider.OPENAI:
      return "encryptedOpenAIKey";
    case AIProvider.GROK:
      return "encryptedGrokKey";
    case AIProvider.GLM:
      return "encryptedGlmKey";
    case AIProvider.CUSTOM:
      return "encryptedApiKey";
    default:
      return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) return auth.response;

    const settings = await ensureAISettings(auth.userId);
    return NextResponse.json(await publicAISettingsWithOAuth(settings));
  } catch (error) {
    logger.error(
      "Failed to fetch AI settings",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to fetch AI settings" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) return auth.response;

    await ensureAISettings(auth.userId);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const provider = isProvider(body.provider) ? body.provider : "NONE";
    const timeout = Number(body.requestTimeoutSeconds);
    const apiKey =
      typeof body.apiKey === "string" && body.apiKey.trim()
        ? encryptSecret(body.apiKey.trim())
        : undefined;
    const keyField = encryptedKeyField(provider);
    const soulPreset = body.soulPreset === "coach" ? "coach" : "business";

    const settings = await prisma.aISettings.update({
      where: { userId: auth.userId },
      data: {
        provider,
        model:
          typeof body.model === "string"
            ? body.model.trim() || defaultModelForProvider(provider)
            : defaultModelForProvider(provider),
        customUrl:
          typeof body.customUrl === "string"
            ? body.customUrl.trim() || getDefaultCustomAIUrl()
            : getDefaultCustomAIUrl(),
        ...(apiKey && keyField && { [keyField]: apiKey }),
        soulPreset,
        allowParseTasks: Boolean(body.allowParseTasks),
        allowReorder: Boolean(body.allowReorder),
        allowSuggestEnergy: Boolean(body.allowSuggestEnergy),
        allowFullAuto: Boolean(body.allowFullAuto),
        requestTimeoutSeconds:
          Number.isFinite(timeout) && timeout >= 5 && timeout <= 60
            ? Math.round(timeout)
            : 20,
      },
    });

    return NextResponse.json(await publicAISettingsWithOAuth(settings));
  } catch (error) {
    logger.error(
      "Failed to update AI settings",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to update AI settings" },
      { status: 500 }
    );
  }
}
