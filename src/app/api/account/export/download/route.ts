import { NextRequest, NextResponse } from "next/server";

import { hashAccountExportToken } from "@/services/account/account-export";
import { DataExportStatus } from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * GET only shows a confirm page. Mail scanners and link prefetchers open links
 * with GET, so a GET must never consume the one-time token; the download
 * itself is the POST of the button below.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ error: "Invalid export link" }, { status: 400 });
  }
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Download your data</title></head>
<body style="font:13px system-ui,sans-serif;max-width:420px;margin:15vh auto;padding:0 16px">
<h1 style="font-size:13px;font-weight:600">Your Needt data export</h1>
<p>This link works once. Press the button to download your export now.</p>
<form method="post" action="/api/account/export/download">
<input type="hidden" name="token" value="${escapeHtml(token)}">
<button type="submit" style="font:inherit;padding:8px 14px">Download</button>
</form></body></html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export async function POST(request: NextRequest) {
  let token: string | undefined;
  try {
    const form = await request.formData();
    const value = form.get("token");
    token = typeof value === "string" ? value.trim() : undefined;
  } catch {
    token = undefined;
  }
  if (!token) {
    return NextResponse.json({ error: "Invalid export link" }, { status: 400 });
  }
  const tokenHash = hashAccountExportToken(token);
  const archive = await prisma.$transaction(async (tx) => {
    const record = await tx.dataExportRequest.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        archive: true,
        expiresAt: true,
        status: true,
        downloadedAt: true,
      },
    });
    if (!record) return null;
    if (!record.expiresAt || record.expiresAt <= newDate()) {
      await tx.dataExportRequest.update({
        where: { id: record.id },
        data: {
          status: DataExportStatus.EXPIRED,
          archive: null,
          tokenHash: null,
        },
      });
      return null;
    }
    if (
      !record.archive ||
      record.downloadedAt ||
      record.status !== DataExportStatus.READY
    ) {
      return null;
    }
    const consumed = await tx.dataExportRequest.updateMany({
      where: {
        id: record.id,
        status: DataExportStatus.READY,
        downloadedAt: null,
      },
      data: {
        status: DataExportStatus.DOWNLOADED,
        downloadedAt: newDate(),
        archive: null,
        tokenHash: null,
      },
    });
    return consumed.count === 1 ? record.archive : null;
  });
  if (!archive) {
    return NextResponse.json(
      { error: "This export link is invalid, expired, or already used" },
      { status: 410 }
    );
  }
  return new Response(new Uint8Array(archive), {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="needt-account-export.json.gz"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
