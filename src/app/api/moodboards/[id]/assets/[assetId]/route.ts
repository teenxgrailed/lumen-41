import { NextRequest, NextResponse } from "next/server";

import { readMoodboardAsset } from "@/services/moodboards/moodboard-item-service";

import { authenticateRequest } from "@/lib/auth/api-auth";

import { moodboardItemErrorResponse } from "../../items/shared";

const LOG_SOURCE = "MoodboardAssetAPI";
type RouteContext = { params: Promise<{ id: string; assetId: string }> };

/** An uploaded picture, for anyone who can see the board. */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id, assetId } = await params;
  try {
    const asset = await readMoodboardAsset(auth, id, assetId);
    return new NextResponse(new Uint8Array(asset.bytes), {
      headers: {
        "Content-Type": asset.mimeType,
        "Content-Length": String(asset.bytes.length),
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        // The id never points at other bytes, so the browser may keep it.
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    return moodboardItemErrorResponse(
      error,
      "Failed to read Moodboard picture",
      LOG_SOURCE,
      "Could not load the picture."
    );
  }
}
