import { NextRequest } from "next/server";

import { fileResponse } from "@/services/agent-hub/attachment-http";
import { readAsOwner } from "@/services/agent-hub/attachments";
import { authenticateHubOwner, hubRoute } from "@/services/agent-hub/http";

type Params = { params: Promise<{ id: string }> };

/** Download one file as the signed-in owner. */
export async function GET(request: NextRequest, { params }: Params) {
  return hubRoute(async () => {
    const auth = await authenticateHubOwner(request, false);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    return fileResponse(await readAsOwner(auth.scope, id));
  });
}
