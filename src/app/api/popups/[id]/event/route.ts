import { NextRequest, NextResponse } from "next/server";

import { recordPopupEvent } from "@/services/popups/popups";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";
import { popupEventSchema } from "@/lib/popups/schema";

const LOG_SOURCE = "PopupsEventAPI";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/popups/:id/event  `{ event: "shown" | "dismiss" | "click" }`
 *
 * `:id` is an announcement id, or `moment:<source>:<key>` for a plan moment.
 * `shown` is what makes a popup count against the frequency cap and, for an
 * announcement, what keeps it from being shown to the person again.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  const { id } = await params;
  const parsed = popupEventSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success || id.length > 200) {
    return NextResponse.json({ error: "That is not valid." }, { status: 400 });
  }

  try {
    const result = await recordPopupEvent(
      auth.userId,
      decodeURIComponent(id),
      parsed.data.event
    );
    if (result === "not_found") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error(
      "Failed to record a popup event",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "Could not save that." }, { status: 500 });
  }
}
