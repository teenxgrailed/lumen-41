import { NextRequest, NextResponse } from "next/server";

import {
  hideStarterGame,
  readStarterStatus,
} from "@/services/starter-game/state";

import { routeErrorResponse } from "@/lib/api/route-error";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { starterHideSchema } from "@/lib/starter-game";

const LOG_SOURCE = "starter-game";
const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" } as const;

/**
 * GET /api/starter-game -> StarterGameStatus
 * Whether the Starter game's entry card may show: fewer than five open tasks,
 * and not hidden ("Not now" for 7 days, "Don't show again" for good).
 * `canPlay` is false on a Free account, which sees the card with PRO.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  try {
    return NextResponse.json(
      await readStarterStatus({
        userId: auth.userId,
        workspace: auth.workspace,
      }),
      { headers: NO_STORE }
    );
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to read the Starter game state",
      LOG_SOURCE,
      "Could not load the Starter game."
    );
  }
}

/**
 * PATCH { hide: "7d" | "never" | "show" } -> StarterGameStatus
 * "7d" is "Not now", "never" is "Don't show again", "show" brings it back.
 */
export async function PATCH(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const body = starterHideSchema.safeParse(
    await request.json().catch(() => ({}))
  );
  if (!body.success) {
    return NextResponse.json(
      { error: 'hide must be "7d", "never" or "show"' },
      { status: 400 }
    );
  }
  try {
    await hideStarterGame(auth.userId, body.data.hide);
    return NextResponse.json(
      await readStarterStatus({
        userId: auth.userId,
        workspace: auth.workspace,
      }),
      { headers: NO_STORE }
    );
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to save the Starter game state",
      LOG_SOURCE,
      "Could not save that."
    );
  }
}
