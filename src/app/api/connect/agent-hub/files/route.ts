import { NextRequest } from "next/server";

import { fileResponse } from "@/services/agent-hub/attachment-http";
import { readSigned } from "@/services/agent-hub/attachments";
import { hubRoute } from "@/services/agent-hub/http";

import { enforceRateLimits, ipRule } from "@/lib/security/rate-limit";

/** A file by its signed link (`?t=`); the signature is the credential. */
export async function GET(request: NextRequest) {
  return hubRoute(async () => {
    const limited = await enforceRateLimits(
      [ipRule(request, "hub-file:ip", 120, 60)],
      { route: request.nextUrl.pathname }
    );
    if (limited) return limited;
    return fileResponse(
      await readSigned(request.nextUrl.searchParams.get("t"))
    );
  });
}
