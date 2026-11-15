import { NextRequest, NextResponse } from "next/server";

import { WorkspaceRole } from "@prisma/client";

import { loadPushTargets } from "@/services/push/targets";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { habitEveningPushEnabled } from "@/lib/feature-flags";

const LOG_SOURCE = "habit-evening-push";

/**
 * Whether the 20:00 habit push exists for this person (the
 * `habit_evening_push` flag), so Settings -> Notifications shows its switch
 * only then. An account without the flag gets a plain `{ enabled: false }`.
 * `hasSubscription` is true when any device on the account (a browser or the
 * iOS app) can get a push: it is the default the switch shows when the person
 * never chose, the same default the worker applies. The choice itself is
 * `UserSettings.prefs.habitEveningPush`.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.VIEWER,
  });
  if (auth.response) return auth.response;
  const enabled = await habitEveningPushEnabled(auth.userId);
  return NextResponse.json(
    {
      enabled,
      hasSubscription: enabled
        ? (await loadPushTargets(auth.userId)).length > 0
        : false,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
