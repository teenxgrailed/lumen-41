import { NextRequest, NextResponse } from "next/server";

import { getPage } from "@/services/pages/page-service";

import { routeErrorResponse } from "@/lib/api/route-error";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { resolvePageAccess } from "@/lib/auth/page-auth";
import { exportFileName, pageToMarkdown } from "@/lib/pages/export-markdown";
import { publicRequestUrl } from "@/lib/public-url";

const LOG_SOURCE = "PageExportAPI";
type RouteContext = { params: Promise<{ id: string }> };

/**
 * `GET /api/pages/:id/export?format=md` - the page as a Markdown file.
 * Access is the page GET's: anyone who can read the page can export it, and a
 * page they cannot read answers 403 / 404 exactly as it does there. PDF is
 * made in the editor (Page options > Export as PDF), not here.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const format = request.nextUrl.searchParams.get("format") ?? "md";
  if (format !== "md" && format !== "markdown") {
    return NextResponse.json(
      {
        error:
          format === "pdf"
            ? "PDF export is available from the editor (Page options > Export as PDF)"
            : "Unsupported export format",
        formats: ["md"],
      },
      { status: 400 }
    );
  }
  try {
    const access = await resolvePageAccess(auth, id);
    if (!access)
      return NextResponse.json(
        { error: "Page access denied" },
        { status: 403 }
      );
    const page = await getPage(auth, id);
    if (!page)
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    const markdown = pageToMarkdown(
      {
        title: page.title,
        blocks: page.blocks as unknown as Parameters<
          typeof pageToMarkdown
        >[0]["blocks"],
      },
      { origin: publicRequestUrl(request).origin }
    );
    const name = exportFileName(page.title, "md");
    const ascii = name.replace(/[^\x20-\x7e]+/g, "_").replace(/["\\]/g, "_");
    return new NextResponse(markdown, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to export page",
      LOG_SOURCE,
      "Could not export page."
    );
  }
}
