import { NextRequest, NextResponse } from "next/server";

import { PageAccessRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { resolvePageAccess } from "@/lib/auth/page-auth";
import { prisma } from "@/lib/prisma";
import {
  accountRule,
  enforceByteBudget,
  enforceRateLimits,
} from "@/lib/security/rate-limit";

const LOG_SOURCE = "PageAssetsAPI";
const MAX_ASSET_BYTES = 10 * 1024 * 1024;
/** Multipart framing around the file; the body is refused above this. */
const FORM_OVERHEAD_BYTES = 64 * 1024;
/** Per person per day, so one account cannot fill the database. */
const DAILY_UPLOAD_BYTES = 250 * 1024 * 1024;
/**
 * Only plain raster pictures keep their declared type. Anything else (SVG,
 * HTML, unknown) is stored as opaque bytes so it is served as a download.
 */
const SAFE_RASTER_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/avif",
]);
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  if (!(await resolvePageAccess(auth, id))) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }
  const assets = await prisma.pageAsset.findMany({
    where: { pageId: id },
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      size: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ assets });
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  if (!(await resolvePageAccess(auth, id, PageAccessRole.EDITOR))) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }
  // Refuse an oversized body before it is buffered into memory.
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_ASSET_BYTES + FORM_OVERHEAD_BYTES) {
    return NextResponse.json(
      { error: "Page assets must be 10 MB or smaller" },
      { status: 413 }
    );
  }
  const limited = await enforceRateLimits(
    [accountRule(auth.userId, "page-assets:upload:account", 60, 60)],
    { route: "/api/pages/[id]/assets", userId: auth.userId }
  );
  if (limited) return limited;
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size <= 0) {
    return NextResponse.json({ error: "Choose a file" }, { status: 400 });
  }
  if (file.size > MAX_ASSET_BYTES) {
    return NextResponse.json(
      { error: "Page assets must be 10 MB or smaller" },
      { status: 413 }
    );
  }
  const overBudget = await enforceByteBudget({
    namespace: "page-assets:upload:account",
    identifier: auth.userId,
    bytes: file.size,
    limitBytes: DAILY_UPLOAD_BYTES,
    windowSeconds: 24 * 60 * 60,
    route: "/api/pages/[id]/assets",
    userId: auth.userId,
  });
  if (overBudget) return overBudget;
  const asset = await prisma.pageAsset.create({
    data: {
      pageId: id,
      userId: auth.userId,
      originalName: file.name.slice(0, 240) || "attachment",
      mimeType: SAFE_RASTER_TYPES.has(file.type.toLowerCase())
        ? file.type.toLowerCase()
        : "application/octet-stream",
      size: file.size,
      bytes: Buffer.from(await file.arrayBuffer()),
    },
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      size: true,
      createdAt: true,
    },
  });
  return NextResponse.json(
    { asset, url: `/api/pages/${id}/assets/${asset.id}` },
    { status: 201 }
  );
}
