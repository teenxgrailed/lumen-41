import { NextRequest, NextResponse } from "next/server";

import {
  deletePageForever,
  getPage,
  updatePage,
} from "@/services/pages/page-service";
import { PageAccessRole, Prisma } from "@prisma/client";

import { routeErrorResponse } from "@/lib/api/route-error";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { resolvePageAccess } from "@/lib/auth/page-auth";
import { pageV3FieldsSchema, parseV3Fields } from "@/lib/needt3/api-fields";
import { proStyleRefusal } from "@/lib/pages/pro-style-gate";

const LOG_SOURCE = "PageDetailAPI";
type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
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
    return NextResponse.json({ page: { ...page, accessRole: access.role } });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to load page",
      LOG_SOURCE,
      "Could not load page."
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  try {
    const body = await request.json().catch(() => ({}));
    const v3 = parseV3Fields(pageV3FieldsSchema, body);
    if (!v3.ok) return NextResponse.json({ error: v3.error }, { status: 400 });
    const requiredRole =
      typeof body.isPrivate === "boolean" || typeof body.trashed === "boolean"
        ? PageAccessRole.FULL_ACCESS
        : PageAccessRole.EDITOR;
    // `{ trashed: false }` restores, so it must see the trashed row.
    const restoring = body.trashed === false;
    if (
      !(await resolvePageAccess(auth, id, requiredRole, {
        includeTrashed: restoring,
      }))
    ) {
      return NextResponse.json(
        { error: "Page access denied" },
        { status: 403 }
      );
    }
    const writesCover =
      body.coverUrl === null || typeof body.coverUrl === "string";
    if (v3.data.style !== undefined || writesCover) {
      const current = await getPage(auth, id);
      if (!current)
        return NextResponse.json({ error: "Page not found" }, { status: 404 });
      const refusal = await proStyleRefusal(
        auth.userId,
        current.style as Record<string, unknown> | null,
        v3.data.style,
        writesCover
          ? { before: current.coverUrl, after: body.coverUrl }
          : undefined
      );
      if (refusal) return refusal;
    }
    const page = await updatePage(auth, id, {
      title: typeof body.title === "string" ? body.title : undefined,
      icon:
        body.icon === null || typeof body.icon === "string"
          ? body.icon
          : undefined,
      coverUrl:
        body.coverUrl === null || typeof body.coverUrl === "string"
          ? body.coverUrl
          : undefined,
      parentId:
        body.parentId === null || typeof body.parentId === "string"
          ? body.parentId
          : undefined,
      isPrivate:
        typeof body.isPrivate === "boolean" ? body.isPrivate : undefined,
      isFavorite:
        typeof body.isFavorite === "boolean" ? body.isFavorite : undefined,
      position: typeof body.position === "number" ? body.position : undefined,
      trashed: typeof body.trashed === "boolean" ? body.trashed : undefined,
      style: v3.data.style as Prisma.InputJsonObject | null | undefined,
      projectId: v3.data.projectId,
    });
    if (!page)
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    return NextResponse.json({ page });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to update page",
      LOG_SOURCE,
      "Could not update page."
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  try {
    // `?permanent=true` deletes a page that is already in Trash for good.
    if (request.nextUrl.searchParams.get("permanent") === "true") {
      const outcome = await deletePageForever(auth, id);
      if (outcome === "not-found")
        return NextResponse.json({ error: "Page not found" }, { status: 404 });
      if (outcome === "not-trashed")
        return NextResponse.json(
          { error: "Only a page in Trash can be deleted for good" },
          { status: 409 }
        );
      return NextResponse.json({ success: true });
    }
    if (!(await resolvePageAccess(auth, id, PageAccessRole.FULL_ACCESS))) {
      return NextResponse.json(
        { error: "Page access denied" },
        { status: 403 }
      );
    }
    const page = await updatePage(auth, id, { trashed: true });
    if (!page)
      return NextResponse.json({ error: "Page not found" }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to trash page",
      LOG_SOURCE,
      "Could not move page to trash."
    );
  }
}
