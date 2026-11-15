import { NextRequest, NextResponse } from "next/server";

import { WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { habitEveningPushEnabled } from "@/lib/feature-flags";

const LOG_SOURCE = "habit-evening-push";

/**
 * Whether the 20:00 habit push exists for this person (the
 * `habit_evening_push` flag), so Settings -> Notifications shows its switch
 * only then. An account without the flag gets a plain `{ enabled: false }`.
 * The choice itself is `UserSettings.prefs.habitEveningPush`.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.VIEWER,
  });
  if (auth.response) return auth.response;
  return NextResponse.json(
    { enabled: await habitEveningPushEnabled(auth.userId) },
    { headers: { "Cache-Control": "no-store" } }
  );
}
