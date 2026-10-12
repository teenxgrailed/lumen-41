import { NextRequest, NextResponse } from "next/server";

import { createPage, listPages } from "@/services/pages/page-service";
import { PageAuthor, Prisma, WorkspaceRole } from "@prisma/client";

import { routeErrorResponse } from "@/lib/api/route-error";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { pageV3FieldsSchema, parseV3Fields } from "@/lib/needt3/api-fields";
import { proStyleRefusal } from "@/lib/pages/pro-style-gate";

const LOG_SOURCE = "PagesAPI";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  try {
    const tagIds = request.nextUrl.searchParams
      .getAll("tagId")
      .filter((tagId) => tagId.length > 0);
    const pages = await listPages(auth, {
      search: request.nextUrl.searchParams.get("q") ?? undefined,
      folderId: request.nextUrl.searchParams.get("folderId") ?? undefined,
      tagIds,
      favorites: request.nextUrl.searchParams.get("favorites") === "true",
      privateOnly: request.nextUrl.searchParams.get("privateOnly") === "true",
      trashed: request.nextUrl.searchParams.get("trashed") === "true",
      // Additive `preview` on every page; `?preview=false` leaves it out.
      preview: request.nextUrl.searchParams.get("preview") !== "false",
    });
    return NextResponse.json({ pages });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to list pages",
      LOG_SOURCE,
      "Could not load pages."
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.EDITOR,
  });
  if ("response" in auth) return auth.response;
  try {
    const body = await request.json().catch(() => ({}));
    const v3 = parseV3Fields(pageV3FieldsSchema, body);
    if (!v3.ok) return NextResponse.json({ error: v3.error }, { status: 400 });
    const refusal = await proStyleRefusal(auth.userId, null, v3.data.style);
    if (refusal) return refusal;
    const page = await createPage(auth, {
      style: v3.data.style as Prisma.InputJsonObject | null | undefined,
      projectId: v3.data.projectId,
      title: typeof body.title === "string" ? body.title : undefined,
      parentId: typeof body.parentId === "string" ? body.parentId : null,
      icon: typeof body.icon === "string" ? body.icon : null,
      isPrivate: body.isPrivate === true,
      createdBy: PageAuthor.HUMAN,
    });
    return NextResponse.json({ page }, { status: 201 });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to create page",
      LOG_SOURCE,
      "Could not create page."
    );
  }
}
