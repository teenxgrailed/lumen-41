import { NextRequest, NextResponse } from "next/server";

import { isChannelName, unlinkUser } from "@/services/channels";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "channels-unlink-api";

/**
 * DELETE /api/channels/:channel: unlink the person's chats on that channel. It
 * works even while the channel is not configured, so a person can always leave.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ channel: string }> }
) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth && auth.response) return auth.response;
  const userId = auth.userId as string;
  const { channel } = await params;
  if (!isChannelName(channel)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  try {
    const unlinked = await unlinkUser(userId, channel);
    return NextResponse.json({ channel, unlinked });
  } catch (error) {
    logger.error(
      "Unlink failed",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
