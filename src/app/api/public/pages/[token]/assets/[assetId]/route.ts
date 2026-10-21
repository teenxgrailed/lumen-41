import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ token: string; assetId: string }> };

/**
 * Assets are other people's bytes served from the app's own origin to anyone
 * with the link. Whatever the stored type says, a response never runs script:
 * an empty-policy sandbox and no content sniffing on every answer. Mirrors the
 * authenticated sibling at src/app/api/pages/[id]/assets/[assetId]/route.ts.
 */
const ASSET_SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'none'; sandbox",
  "X-Content-Type-Options": "nosniff",
} as const;

/** Pictures show inline, except SVG, which can carry script. */
function isInlineType(mimeType: string) {
  const type = mimeType.toLowerCase();
  return type.startsWith("image/") && !type.startsWith("image/svg");
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const { token, assetId } = await params;
  const asset = await prisma.pageAsset.findFirst({
    where: {
      id: assetId,
      page: {
        trashedAt: null,
        publication: { token, revokedAt: null },
      },
    },
  });
  if (!asset) {
    return NextResponse.json(
      { error: "Published asset not found" },
      {
        status: 404,
        headers: { ...ASSET_SECURITY_HEADERS, "Cache-Control": "no-store" },
      }
    );
  }
  const disposition = isInlineType(asset.mimeType) ? "inline" : "attachment";
  const safeName = asset.originalName.replace(/["\r\n]/g, "_");
  return new NextResponse(asset.bytes, {
    headers: {
      ...ASSET_SECURITY_HEADERS,
      "Content-Type": asset.mimeType,
      "Content-Length": String(asset.size),
      "Content-Disposition": `${disposition}; filename="${safeName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
