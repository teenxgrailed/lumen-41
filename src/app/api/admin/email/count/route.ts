import { NextRequest, NextResponse } from "next/server";

import { SEGMENTS, type Segment } from "@/services/email-broadcasts/rules";
import { countRecipients } from "@/services/email-broadcasts/service";

import { routeErrorResponse } from "@/lib/api/route-error";
import { requireAdmin } from "@/lib/auth/api-auth";

const LOG_SOURCE = "AdminEmailCountAPI";

export const runtime = "nodejs";

/**
 * GET /api/admin/email/count?segment=free&category=updates : how many people
 * would receive a broadcast right now, after every exclusion.
 */
export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const segment = request.nextUrl.searchParams.get("segment");
  const category =
    request.nextUrl.searchParams.get("category") === "offers"
      ? "offers"
      : "updates";
  if (!segment || !(SEGMENTS as readonly string[]).includes(segment)) {
    return NextResponse.json({ error: "Pick a segment." }, { status: 400 });
  }
  try {
    return NextResponse.json({
      segment,
      category,
      count: await countRecipients(segment as Segment, category),
    });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Could not count recipients",
      LOG_SOURCE,
      "The count could not be worked out."
    );
  }
}
