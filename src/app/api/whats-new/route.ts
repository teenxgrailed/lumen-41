import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { loadWhatsNewFeed } from "@/lib/whats-new/feed";
import {
  SEEN_PREF,
  parseSeen,
  seenMarker,
  unseenIds,
} from "@/lib/whats-new/seen";

const LOG_SOURCE = "WhatsNewAPI";

/**
 * GET /api/whats-new — the latest user-facing changes, newest day first,
 * and which of them this person has not opened yet.
 *
 * `marker` is what to store in `UserSettings.prefs.whatsNewSeen` (through
 * `PATCH /api/user-settings`) once they have been read.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) return auth.response;

    const [feed, settings, user] = await Promise.all([
      loadWhatsNewFeed(),
      prisma.userSettings.findUnique({
        where: { userId: auth.userId },
        select: { prefs: true },
      }),
      prisma.user.findUnique({
        where: { id: auth.userId },
        select: { createdAt: true },
      }),
    ]);
    const prefs =
      settings?.prefs && typeof settings.prefs === "object"
        ? (settings.prefs as Record<string, unknown>)
        : {};
    const since = user?.createdAt
      ? user.createdAt.toISOString().slice(0, 10)
      : null;

    return NextResponse.json({
      groups: feed.groups,
      unseen: unseenIds(feed, parseSeen(prefs[SEEN_PREF]), since),
      marker: seenMarker(feed),
    });
  } catch (error) {
    logger.error(
      "Failed to read what's new",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to read what's new" },
      { status: 500 }
    );
  }
}
