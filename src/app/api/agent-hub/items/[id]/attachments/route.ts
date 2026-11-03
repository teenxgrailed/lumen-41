import { NextRequest, NextResponse } from "next/server";

import {
  limitAttachmentWrites,
  readBodyCapped,
} from "@/services/agent-hub/attachment-http";
import { HUB_ATTACHMENT_MAX_BYTES } from "@/services/agent-hub/attachment-rules";
import {
  addAttachment,
  listAttachments,
} from "@/services/agent-hub/attachments";
import { authenticateHubOwner, hubRoute } from "@/services/agent-hub/http";

type Params = { params: Promise<{ id: string }> };

/** Room for the multipart envelope. */
const FORM_OVERHEAD = 64 * 1024;

/** The owner's view of an item's files (session auth). */
export async function GET(request: NextRequest, { params }: Params) {
  return hubRoute(async () => {
    const auth = await authenticateHubOwner(request, false);
    if ("response" in auth) return auth.response;
    const { id } = await params;
    return NextResponse.json(await listAttachments(auth.scope, id));
  });
}

/** The owner attaches a file: multipart `file`, up to 25 MB. */
export async function POST(request: NextRequest, { params }: Params) {
  return hubRoute(async () => {
    const auth = await authenticateHubOwner(request, true);
    if ("response" in auth) return auth.response;
    const limited = await limitAttachmentWrites(request, auth.scope.userId);
    if (limited) return limited;
    const { id } = await params;
    const body = await readBodyCapped(
      request,
      HUB_ATTACHMENT_MAX_BYTES + FORM_OVERHEAD
    );
    if (body === "too_large") {
      return NextResponse.json(
        {
          status: 413,
          error: "INVALID",
          message: "Attachments must be 25 MB or smaller.",
        },
        { status: 413 }
      );
    }
    const form = await new Response(new Uint8Array(body), {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    })
      .formData()
      .catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { status: 400, error: "INVALID", message: 'Send a multipart "file".' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      await addAttachment(auth.scope, {
        itemId: id,
        name: file.name,
        bytes: Buffer.from(await file.arrayBuffer()),
        mime: file.type || undefined,
      }),
      { status: 201 }
    );
  });
}
