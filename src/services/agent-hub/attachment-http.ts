import { NextResponse } from "next/server";

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
