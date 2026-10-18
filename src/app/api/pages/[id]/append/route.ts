import { NextRequest, NextResponse } from "next/server";

import { appendPageBlocks } from "@/services/pages/page-service";
import {
  PAGE_TEXT_MAX_LENGTH,
  pageBlocksFromText,
} from "@/services/pages/page-text-blocks";
import {
  PageBlockIdentityError,
  PageCollaborationActiveError,
  PageRevisionConflictError,
} from "@/services/pages/page-write-path";
import { PageAccessRole, PageAuthor } from "@prisma/client";

import { routeErrorResponse } from "@/lib/api/route-error";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { resolvePageAccess } from "@/lib/auth/page-auth";

const LOG_SOURCE = "PageAppendAPI";
type RouteContext = { params: Promise<{ id: string }> };

/**
 * Append text to the end of a page the caller can edit; earlier content is
 * kept. Body: `{ text: string, format?: "markdown" | "plain" }`.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  try {
    if (!(await resolvePageAccess(auth, id, PageAccessRole.EDITOR))) {
      return NextResponse.json(
        { error: "Page access denied" },
        { status: 403 }
      );
    }
    const body = await request.json().catch(() => ({}));
    const text = typeof body.text === "string" ? body.text : "";
    if (!text.trim() || text.length > PAGE_TEXT_MAX_LENGTH) {
      return NextResponse.json(
        { error: "text is required (up to 100000 characters)" },
        { status: 400 }
      );
    }
    const format = body.format === "plain" ? "plain" : "markdown";
    const blocks = pageBlocksFromText(text, format, PageAuthor.HUMAN);
    if (!blocks.length) {
      return NextResponse.json(
        { error: "text has no content" },
        { status: 400 }
      );
    }
    const page = await appendPageBlocks(auth, id, blocks, PageAuthor.HUMAN);
    if (!page) {
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    }
    return NextResponse.json({ page, appendedBlocks: blocks.length });
  } catch (error) {
    if (
      error instanceof PageBlockIdentityError ||
      error instanceof PageCollaborationActiveError ||
      error instanceof PageRevisionConflictError
    ) {
      return NextResponse.json({ error: error.code }, { status: 409 });
    }
    return routeErrorResponse(
      error,
      "Failed to append to page",
      LOG_SOURCE,
      "Could not save to the page."
    );
  }
}
