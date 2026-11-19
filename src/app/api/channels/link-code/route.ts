import { NextRequest, NextResponse } from "next/server";

import {
  CHANNELS,
  channelConfigured,
  createLinkCode,
  isChannelName,
} from "@/services/channels";
import { telegramDeepLink } from "@/services/channels/telegram/config";
import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import {
  accountRule,
  enforceRateLimits,
  ipRule,
} from "@/lib/security/rate-limit";

const LOG_SOURCE = "channels-link-code-api";

const bodySchema = z.object({ channel: z.enum(CHANNELS) }).strict();

/**
 * POST /api/channels/link-code {channel}: a single-use code, valid 10 minutes,
 * that links a messenger chat to this account. 503 `channel_not_configured`
 * while the server has no bot secrets for the channel.
 */
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth && auth.response) return auth.response;
  const userId = auth.userId as string;
  try {
    const limited = await enforceRateLimits(
      [
        ipRule(request, "channels-link-code:ip", 30, 60),
        accountRule(userId, "channels-link-code:account", 10, 60),
      ],
      { route: "/api/channels/link-code", userId }
    );
    if (limited) return limited;

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || !isChannelName(parsed.data.channel)) {
      return NextResponse.json({ error: "invalid_input" }, { status: 400 });
    }
    const { channel } = parsed.data;
    if (!channelConfigured(channel)) {
      return NextResponse.json(
        {
          error: "channel_not_configured",
          message: "This channel is not set up on this server yet.",
        },
        { status: 503 }
      );
    }
    const { code, expiresAt } = await createLinkCode(userId, channel);
    return NextResponse.json({
      channel,
      code,
      expiresAt: expiresAt.toISOString(),
      deepLink: channel === "telegram" ? telegramDeepLink(code) : null,
    });
  } catch (error) {
    logger.error(
      "Link code failed",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
