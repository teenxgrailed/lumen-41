import { NextRequest, NextResponse } from "next/server";

import { getNextPopup } from "@/services/popups/popups";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { isPopupLimit } from "@/lib/popups/moments";
import { POPUP_PLATFORMS, type PopupPlatform } from "@/lib/popups/types";

const LOG_SOURCE = "PopupsNextAPI";

export const runtime = "nodejs";

const flag = (value: string | null) => value === "1" || value === "true";

/**
 * GET /api/popups/next
 *
 * The one popup to show now, or `{ popup: null }`. Read-only: the host
 * reports `shown` to `POST /api/popups/:id/event`. The query carries what
 * only the client knows:
 * - `platform` (web | ios | mac | windows), `appVersion`
 * - `limit` (habits | ai | boards | calendars | auto_schedule) right after a
 *   limit blocked an action
 * - `onboarding`, `focus`, `dialog`, `session` (1 when true): suppression
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  const q = request.nextUrl.searchParams;
  const platformParam = q.get("platform");
  const platform: PopupPlatform = (
    POPUP_PLATFORMS as readonly string[]
  ).includes(platformParam ?? "")
    ? (platformParam as PopupPlatform)
    : "web";
  const version = q.get("appVersion");
  const limitParam = q.get("limit");

  try {
    const popup = await getNextPopup(auth.userId, {
      platform,
      appVersion: version && /^\d+(\.\d+){0,3}$/.test(version) ? version : null,
      limit: isPopupLimit(limitParam) ? limitParam : null,
      ctx: {
        inOnboarding: flag(q.get("onboarding")),
        inFocus: flag(q.get("focus")),
        dialogOpen: flag(q.get("dialog")),
        shownThisSession: flag(q.get("session")),
      },
    });
    return NextResponse.json(
      { popup },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    logger.error(
      "Failed to pick a popup",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    // A popup is never worth an error screen: nothing to show.
    return NextResponse.json({ popup: null });
  }
}
