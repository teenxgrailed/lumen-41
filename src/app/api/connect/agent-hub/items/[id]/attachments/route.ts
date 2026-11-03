import { NextRequest, NextResponse } from "next/server";

import { limitAttachmentWrites } from "@/services/agent-hub/attachment-http";
import {
  addAttachment,
  listAttachments,
  prepareUpload,
} from "@/services/agent-hub/attachments";
import {
  authenticateHubAgent,
  hubRoute,
  parseJsonBody,
} from "@/services/agent-hub/http";
import { attachInput } from "@/services/agent-hub/schemas";

type Params = { params: Promise<{ id: string }> };

/** The item's files with signed download links (24 h). */
export async function GET(request: NextRequest, { params }: Params) {
  return hubRoute(async () => {
    const auth = await authenticateHubAgent(request, false);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    return NextResponse.json(await listAttachments(auth.scope, id));
  });
}

/**
 * JSON `{ name, contentBase64?, mime? }`. With `contentBase64` the file is
 * stored; without it the answer is a 15-minute `uploadUrl` for a raw PUT.
 */
export async function POST(request: NextRequest, { params }: Params) {
  return hubRoute(async () => {
    const auth = await authenticateHubAgent(request, true);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    const body = await parseJsonBody(
      request,
      attachInput.omit({ itemId: true })
    );
    if ("response" in body) return body.response;
    const input = { ...body.data, itemId: id };
    if (input.contentBase64) {
      const limited = await limitAttachmentWrites(request, auth.scope.userId);
      if (limited) return limited;
    }
    return NextResponse.json(
      input.contentBase64
        ? await addAttachment(auth.scope, input)
        : await prepareUpload(auth.scope, input),
      { status: input.contentBase64 ? 201 : 200 }
    );
  });
}
