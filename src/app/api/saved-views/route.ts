import { NextRequest, NextResponse } from "next/server";

import {
  Prisma,
  SavedViewResource,
  SavedViewVisibility,
} from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { workspaceDataScopeWhere } from "@/lib/auth/workspace-auth";
import { prisma } from "@/lib/prisma";
import { canManageWorkspaceView, savedViewInputSchema } from "@/lib/saved-views";

const LOG_SOURCE = "SavedViewsAPI";

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const rawResource = request.nextUrl.searchParams.get("resource") ?? undefined;
  const resource = Object.values(SavedViewResource).find(
    (value) => value === rawResource
  );
  if (rawResource && !resource) {
    return NextResponse.json({ error: "Invalid resource" }, { status: 400 });
  }
  const views = await prisma.savedView.findMany({
    where: {
      archivedAt: null,
      ...(auth.workspace?.dataScope.mode === "workspace"
        ? { workspaceId: auth.workspace.workspaceId }
        : {
            userId: auth.userId,
            OR: [
              { workspaceId: null },
              { workspaceId: auth.workspace?.workspaceId },
            ],
          }),
      ...(resource ? { resource } : {}),
      ...(auth.workspace?.dataScope.mode === "workspace"
        ? {
            OR: [
              { visibility: SavedViewVisibility.WORKSPACE },
              { userId: auth.userId },
            ],
          }
        : {}),
    },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  return NextResponse.json({ views });
}

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const parsed = savedViewInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid saved view", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }
  if (
    parsed.data.visibility === SavedViewVisibility.WORKSPACE &&
    !canManageWorkspaceView(auth.workspace!.role)
  ) {
    return NextResponse.json({ error: "Editor role required" }, { status: 403 });
  }
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
  const view = await prisma.savedView.create({
    data: {
      ...parsed.data,
      filters: parsed.data.filters as Prisma.InputJsonValue,
      sort: parsed.data.sort as Prisma.InputJsonValue,
      userId: auth.userId,
      workspaceId: auth.workspace!.workspaceId,
    },
  });
  return NextResponse.json({ view }, { status: 201 });
}
