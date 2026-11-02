import { NextRequest, NextResponse } from "next/server";

import {
  BroadcastError,
  broadcastResult,
  updateBroadcast,
} from "@/services/email-broadcasts/service";

import { routeErrorResponse } from "@/lib/api/route-error";
import { requireAdmin } from "@/lib/auth/api-auth";

const LOG_SOURCE = "AdminBroadcastAPI";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

function failure(error: unknown, message: string) {
  if (error instanceof BroadcastError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.status }
    );
  }
  return routeErrorResponse(error, message, LOG_SOURCE, message);
}

/** GET : one broadcast with its result (sent, skipped by reason, bounced). */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    const { id } = await params;
    return NextResponse.json(await broadcastResult(id));
  } catch (error) {
    return failure(error, "The broadcast could not be loaded.");
  }
}

/** PATCH : edit a draft or scheduled broadcast; the test must be repeated. */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  try {
    const { id } = await params;
    const broadcast = await updateBroadcast(
      id,
      await request.json().catch(() => null)
    );
    return NextResponse.json({ broadcast });
  } catch (error) {
    return failure(error, "The broadcast could not be saved.");
  }
}
