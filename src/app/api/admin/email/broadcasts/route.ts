import { NextRequest, NextResponse } from "next/server";

import { adminActorId } from "@/services/admin/audit";
import {
  BroadcastError,
  createBroadcast,
  listBroadcasts,
} from "@/services/email-broadcasts/service";

import { routeErrorResponse } from "@/lib/api/route-error";
import { requireAdmin } from "@/lib/auth/api-auth";

const LOG_SOURCE = "AdminBroadcastsAPI";

export const runtime = "nodejs";

/** GET /api/admin/email/broadcasts : the newest broadcasts. */
export async function GET(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    return NextResponse.json({ broadcasts: await listBroadcasts() });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Could not list broadcasts",
      LOG_SOURCE,
      "The broadcasts could not be loaded."
    );
  }
}

/** POST /api/admin/email/broadcasts : save a draft. Nothing is sent. */
export async function POST(request: NextRequest) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    const actorId = await adminActorId(request);
    if (!actorId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const broadcast = await createBroadcast(
      { id: actorId, kind: "admin" },
      await request.json().catch(() => null)
    );
    return NextResponse.json({ broadcast }, { status: 201 });
  } catch (error) {
    if (error instanceof BroadcastError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    }
    return routeErrorResponse(
      error,
      "Could not save the broadcast",
      LOG_SOURCE,
      "The draft could not be saved."
    );
  }
}
