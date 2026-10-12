import { NextRequest, NextResponse } from "next/server";

import { readPublicMoodboardAsset } from "@/services/moodboards/moodboard-service";

type RouteContext = {
  params: Promise<{ id: string; token: string; assetId: string }>;
};

export const dynamic = "force-dynamic";

/** A picture of a publicly shared moodboard; 404 once sharing is off. */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { id, token, assetId } = await params;
  const asset = await readPublicMoodboardAsset(id, token, assetId);
  if (!asset) {
    return NextResponse.json(
      { error: "Picture not found" },
      { status: 404, headers: { "Cache-Control": "no-store" } }
    );
  }
  return new NextResponse(new Uint8Array(asset.bytes), {
    headers: {
      "Content-Type": asset.mimeType,
      "Content-Length": String(asset.bytes.length),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "no-store",
    },
  });
}
