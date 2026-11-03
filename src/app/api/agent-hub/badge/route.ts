import { NextRequest, NextResponse } from "next/server";

import { unreadCount } from "@/services/agent-hub/alerts";
import { hubRoute } from "@/services/agent-hub/http";
import { sweepHub } from "@/services/agent-hub/sweep";
import { WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { agentHubEnabled } from "@/lib/feature-flags";

const LOG_SOURCE = "agent-hub-badge";

/**
 * What the navigation needs to know about the hub: whether the Agents item is
 * shown at all (the `agent_hub` flag, and the plan check once it is turned on
 * for plans) and how many alerts the owner has not opened. Unlike the rest of
 * the hub, an account without the flag gets a plain `{ enabled: false }`: the
 * sidebar asks on every load and must not see errors. Session auth only.
 *
 * The read also settles the lazy "no capable agent" check, so that alert can
 * fire without anyone opening the Agents screen.
 */
export async function GET(request: NextRequest) {
  return hubRoute(async () => {
    const auth = await authenticateRequest(request, LOG_SOURCE, {
      requiredRole: WorkspaceRole.VIEWER,
    });
    if (auth.response) return auth.response;
    const headers = { "Cache-Control": "no-store" };
    if (!auth.workspace || !(await agentHubEnabled(auth.userId))) {
      return NextResponse.json({ enabled: false, unread: 0 }, { headers });
    }
    const key = {
      userId: auth.userId,
      workspaceId: auth.workspace.workspaceId,
    };
    await sweepHub(key);
    return NextResponse.json(
      { enabled: true, unread: await unreadCount(key) },
      { headers }
    );
  });
}
