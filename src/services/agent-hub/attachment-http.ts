import { NextResponse } from "next/server";

import { accountRule, enforceRateLimits } from "@/lib/security/rate-limit";

import { HUB_ATTACHMENT_MAX_BYTES } from "./attachment-rules";

/** A stored file as a download: never rendered, never sniffed, never scripted. */
export function fileResponse(file: {
  name: string;
  mime: string;
  bytes: Buffer;
}) {
  const ascii = file.name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return new NextResponse(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.mime,
      "Content-Length": String(file.bytes.length),
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox; default-src 'none'",
      "Cache-Control": "private, no-store",
    },
  });
}

/** The request body, or "too_large" as soon as more than the file cap arrives. */
export async function readBodyCapped(
  request: Request,
  max = HUB_ATTACHMENT_MAX_BYTES
): Promise<Buffer | "too_large"> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) return "too_large";
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      return "too_large";
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** Attachment writes carry up to 25 MB each: a tighter limit than other hub writes. */
const ATTACHMENT_WRITES_PER_MINUTE = 6;

export function limitAttachmentWrites(request: Request, userId: string) {
  return enforceRateLimits(
    [
      accountRule(
        userId,
        "hub-attachment:write",
        ATTACHMENT_WRITES_PER_MINUTE,
        60
      ),
    ],
    { route: new URL(request.url).pathname, userId }
  );
}
