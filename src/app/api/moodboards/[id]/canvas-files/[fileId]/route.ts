import { NextRequest, NextResponse } from "next/server";

import { readCanvasFile } from "@/services/moodboards/moodboard-canvas";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { resolveMoodboardAccess } from "@/lib/auth/moodboard-auth";

const LOG_SOURCE = "MoodboardCanvasFileAPI";
type RouteContext = { params: Promise<{ id: string; fileId: string }> };

/**
 * A picture the old canvas stored, streamed read-only so the grid can show it.
 * Nothing is written; the canvas's own state is not changed.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id, fileId } = await params;
  if (!(await resolveMoodboardAccess(auth, id))) {
    return NextResponse.json(
      { error: "Moodboard access denied" },
      { status: 403 }
    );
  }
  const file = await readCanvasFile(id, fileId).catch(() => null);
  if (!file) {
    return NextResponse.json({ error: "Picture not found" }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.mime,
      "Content-Length": String(file.bytes.length),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, max-age=300",
    },
  });
}
