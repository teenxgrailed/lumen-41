import { NextRequest, NextResponse } from "next/server";

import {
  DAY_KEY,
  highlightTaskSelect,
  loadHighlight,
  shapeHighlight,
} from "@/services/highlight/highlight-service";
import { WorkspaceRole } from "@prisma/client";

import { routeErrorResponse } from "@/lib/api/route-error";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { workspaceDataScopeWhere } from "@/lib/auth/workspace-auth";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "HighlightAPI";

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

/**
 * GET /api/highlight?date=YYYY-MM-DD -> { highlight } | { highlight: null }
 * The day is the person's own day, as the client sees it.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const date = request.nextUrl.searchParams.get("date") ?? "";
  if (!DAY_KEY.test(date)) return bad("date must be YYYY-MM-DD");
  if (!auth.workspace) {
    return NextResponse.json(
      { error: "Workspace unavailable" },
      { status: 500 }
    );
  }
  try {
    const row = await loadHighlight(
      auth.userId,
      auth.workspace.workspaceId,
      date
    );
    return NextResponse.json({ highlight: shapeHighlight(row) });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to read the highlight",
      LOG_SOURCE,
      "Could not load the highlight."
    );
  }
}

/** PUT { date, taskId } -> { highlight }. Replaces the day's highlight. */
export async function PUT(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.EDITOR,
  });
  if ("response" in auth) return auth.response;
  if (!auth.workspace) {
    return NextResponse.json(
      { error: "Workspace unavailable" },
      { status: 500 }
    );
  }
  const body = await request.json().catch(() => ({}));
  const date = typeof body.date === "string" ? body.date : "";
  const taskId = typeof body.taskId === "string" ? body.taskId : "";
  if (!DAY_KEY.test(date)) return bad("date must be YYYY-MM-DD");
  if (!taskId) return bad("taskId is required");
  try {
    const task = await prisma.task.findFirst({
      where: {
        id: taskId,
        trashedAt: null,
        ...workspaceDataScopeWhere(auth.workspace, auth.userId),
      },
      select: { id: true },
    });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    const key = {
      userId: auth.userId,
      workspaceId: auth.workspace.workspaceId,
      date,
    };
    const row = await prisma.dailyHighlight.upsert({
      where: { userId_workspaceId_date: key },
      create: { ...key, taskId },
      update: { taskId },
      include: { task: { select: highlightTaskSelect } },
    });
    return NextResponse.json({ highlight: shapeHighlight(row) });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to set the highlight",
      LOG_SOURCE,
      "Could not set the highlight."
    );
  }
}

/** DELETE ?date=YYYY-MM-DD -> { highlight: null }. Safe to repeat. */
export async function DELETE(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.EDITOR,
  });
  if ("response" in auth) return auth.response;
  if (!auth.workspace) {
    return NextResponse.json(
      { error: "Workspace unavailable" },
      { status: 500 }
    );
  }
  const date = request.nextUrl.searchParams.get("date") ?? "";
  if (!DAY_KEY.test(date)) return bad("date must be YYYY-MM-DD");
  try {
    await prisma.dailyHighlight.deleteMany({
      where: {
        userId: auth.userId,
        workspaceId: auth.workspace.workspaceId,
        date,
      },
    });
    return NextResponse.json({ highlight: null });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to clear the highlight",
      LOG_SOURCE,
      "Could not clear the highlight."
    );
  }
}
