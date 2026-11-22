import { NextRequest, NextResponse } from "next/server";

import {
  CHANNELS,
  channelConfigured,
  listActiveLinks,
} from "@/services/channels";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "channels-api";

/** GET /api/channels: for each channel, whether it is set up and linked. */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth && auth.response) return auth.response;
  const userId = auth.userId as string;
  try {
    const links = await listActiveLinks(userId);
    return NextResponse.json({
      channels: CHANNELS.map((channel) => ({
        channel,
        configured: channelConfigured(channel),
        linked: links.some((link) => link.channel === channel),
      })),
    });
  } catch (error) {
    logger.error(
      "Channel status failed",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
