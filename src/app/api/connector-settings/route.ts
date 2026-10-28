import { NextRequest, NextResponse } from "next/server";

import {
  ensureConnectorSettings,
  generateConnectorToken,
  hashConnectorToken,
} from "@/services/connectors/auth";
import {
  connectorTokenExpiresAt,
  isConnectorTokenExpired,
} from "@/services/connectors/auth-tokens";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { refuseSandbox } from "@/lib/sandbox/guard";

const LOG_SOURCE = "connector-settings-api";

function publicSettings(
  settings: Awaited<ReturnType<typeof ensureConnectorSettings>>
) {
  return {
    hasToken: Boolean(settings.tokenHash),
    tokenPreview: settings.tokenPreview,
    // Null for a token made before expiry existed: it does not expire.
    tokenExpiresAt: settings.tokenHash
      ? (settings.tokenExpiresAt?.toISOString() ?? null)
      : null,
    tokenExpired:
      Boolean(settings.tokenHash) &&
      isConnectorTokenExpired(settings.tokenExpiresAt),
    webhookUrl: settings.webhookUrl,
    webhookSchedule: settings.webhookSchedule,
    webhookTaskComplete: settings.webhookTaskComplete,
  };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) return auth.response;

    const settings = await ensureConnectorSettings(auth.userId);
    return NextResponse.json(publicSettings(settings));
  } catch (error) {
    logger.error(
      "Failed to fetch connector settings",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to fetch connector settings" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) return auth.response;
    const locked = await refuseSandbox(auth.userId, "api_tokens");
    if (locked) return locked;

    await ensureConnectorSettings(auth.userId);
    const token = generateConnectorToken();
    const settings = await prisma.connectorSettings.update({
      where: { userId: auth.userId },
      data: {
        tokenHash: hashConnectorToken(token),
        tokenPreview: `${token.slice(0, 10)}...${token.slice(-4)}`,
        tokenExpiresAt: connectorTokenExpiresAt(),
      },
    });

    return NextResponse.json({ ...publicSettings(settings), token });
  } catch (error) {
    logger.error(
      "Failed to generate connector token",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to generate connector token" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) return auth.response;
    const locked = await refuseSandbox(auth.userId, "webhooks");
    if (locked) return locked;

    await ensureConnectorSettings(auth.userId);
    const body = await request.json();
    const settings = await prisma.connectorSettings.update({
      where: { userId: auth.userId },
      data: {
        webhookUrl:
          typeof body.webhookUrl === "string"
            ? body.webhookUrl.trim() || null
            : null,
        webhookSchedule: Boolean(body.webhookSchedule),
        webhookTaskComplete: Boolean(body.webhookTaskComplete),
      },
    });

    return NextResponse.json(publicSettings(settings));
  } catch (error) {
    logger.error(
      "Failed to update connector settings",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to update connector settings" },
      { status: 500 }
    );
  }
}
