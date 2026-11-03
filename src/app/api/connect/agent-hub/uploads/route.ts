import { NextRequest, NextResponse } from "next/server";

import { readBodyCapped } from "@/services/agent-hub/attachment-http";
import { receiveUpload } from "@/services/agent-hub/attachments";
import { hubRoute } from "@/services/agent-hub/http";

import { enforceRateLimits, ipRule } from "@/lib/security/rate-limit";

/** PUT the raw bytes to the `uploadUrl` that `needt_agent_attach` returned. */
export async function PUT(request: NextRequest) {
  return hubRoute(async () => {
    const limited = await enforceRateLimits(
      [ipRule(request, "hub-upload:ip", 30, 60)],
      { route: request.nextUrl.pathname }
    );
    if (limited) return limited;
    const bytes = await readBodyCapped(request);
    if (bytes === "too_large") {
      return NextResponse.json(
        {
          status: 413,
          error: "INVALID",
          message: "Attachments must be 25 MB or smaller.",
        },
        { status: 413 }
      );
    }
    return NextResponse.json(
      await receiveUpload(request.nextUrl.searchParams.get("t"), bytes),
      { status: 201 }
    );
  });
}
