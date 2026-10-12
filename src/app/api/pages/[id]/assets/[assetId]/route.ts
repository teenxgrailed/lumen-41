import { NextRequest, NextResponse } from "next/server";

import { PageAccessRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { resolvePageAccess } from "@/lib/auth/page-auth";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "PageAssetAPI";
type RouteContext = {
  params: Promise<{ id: string; assetId: string }>;
};

/**
 * Assets are other people's bytes (uploads, imports) served from the app's
 * own origin. Whatever the stored type says, a response never runs script:
 * an empty-policy sandbox and no content sniffing on every answer.
 */
const ASSET_SECURITY_HEADERS = {
  "Content-Security-Policy": "default-src 'none'; sandbox",
  "X-Content-Type-Options": "nosniff",
} as const;

function assetJson(body: { error: string }, status: number) {
  return NextResponse.json(body, {
    status,
    headers: ASSET_SECURITY_HEADERS,
  });
}

/** Pictures show inline, except SVG, which can carry script. */
function isInlineType(mimeType: string) {
  const type = mimeType.toLowerCase();
  return type.startsWith("image/") && !type.startsWith("image/svg");
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if (auth.response) {
    for (const [name, value] of Object.entries(ASSET_SECURITY_HEADERS)) {
      auth.response.headers.set(name, value);
    }
    return auth.response;
  }
  const { id, assetId } = await params;
  if (!(await resolvePageAccess(auth, id))) {
    return assetJson({ error: "Page access denied" }, 403);
  }
  const asset = await prisma.pageAsset.findFirst({
    where: { id: assetId, pageId: id },
  });
  if (!asset) {
    return assetJson({ error: "Asset not found" }, 404);
  }
  const disposition = isInlineType(asset.mimeType) ? "inline" : "attachment";
  const safeName = asset.originalName.replace(/["\r\n]/g, "_");
  return new NextResponse(asset.bytes, {
    headers: {
      ...ASSET_SECURITY_HEADERS,
      "Content-Type": asset.mimeType,
      "Content-Length": String(asset.size),
      "Content-Disposition": `${disposition}; filename="${safeName}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id, assetId } = await params;
  if (!(await resolvePageAccess(auth, id, PageAccessRole.EDITOR))) {
    return NextResponse.json({ error: "Page access denied" }, { status: 403 });
  }
  const result = await prisma.pageAsset.deleteMany({
    where: { id: assetId, pageId: id },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
