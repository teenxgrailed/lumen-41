import { NextRequest, NextResponse } from "next/server";

import { Prisma, SavedViewVisibility } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import {
  type WorkspaceAccess,
  workspaceDataScopeWhere,
} from "@/lib/auth/workspace-auth";
import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";
import { canManageWorkspaceView, savedViewPatchSchema } from "@/lib/saved-views";

const LOG_SOURCE = "SavedViewAPI";
type RouteContext = { params: Promise<{ id: string }> };

async function findView(
  userId: string,
  workspace: WorkspaceAccess,
  id: string
) {
  return prisma.savedView.findFirst({
    where: {
      id,
      archivedAt: null,
      ...(workspace.dataScope.mode === "workspace"
        ? {
            workspaceId: workspace.workspaceId,
            OR: [
              { visibility: SavedViewVisibility.WORKSPACE },
              { userId },
            ],
          }
        : {
            userId,
            OR: [{ workspaceId: null }, { workspaceId: workspace.workspaceId }],
          }),
    },
  });
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const existing = await findView(auth.userId, auth.workspace!, id);
  if (!existing) return NextResponse.json({ error: "Saved view not found" }, { status: 404 });
  if (
    (existing.visibility === SavedViewVisibility.WORKSPACE ||
      existing.userId !== auth.userId) &&
    !canManageWorkspaceView(auth.workspace!.role)
  ) {
    return NextResponse.json({ error: "Editor role required" }, { status: 403 });
  }
  const parsed = savedViewPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid saved view" }, { status: 400 });
  if (parsed.data.boardId) {
    const board = await prisma.board.findFirst({
      where: {
        id: parsed.data.boardId,
        ...workspaceDataScopeWhere(auth.workspace, auth.userId),
      },
      select: { id: true },
    });
    if (!board) return NextResponse.json({ error: "Board not found" }, { status: 404 });
  }
  if (
    parsed.data.visibility === SavedViewVisibility.WORKSPACE &&
    !canManageWorkspaceView(auth.workspace!.role)
  ) {
    return NextResponse.json({ error: "Editor role required" }, { status: 403 });
  }
  const view = await prisma.savedView.update({
    where: { id },
    data: {
      ...parsed.data,
      filters: parsed.data.filters as Prisma.InputJsonValue | undefined,
      sort: parsed.data.sort as Prisma.InputJsonValue | undefined,
    },
  });
  return NextResponse.json({ view });
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const existing = await findView(auth.userId, auth.workspace!, id);
  if (!existing) return NextResponse.json({ error: "Saved view not found" }, { status: 404 });
  if (
    (existing.visibility === SavedViewVisibility.WORKSPACE ||
      existing.userId !== auth.userId) &&
    !canManageWorkspaceView(auth.workspace!.role)
  ) {
    return NextResponse.json({ error: "Editor role required" }, { status: 403 });
  }
  await prisma.savedView.update({ where: { id }, data: { archivedAt: newDate() } });
  return new NextResponse(null, { status: 204 });
}
