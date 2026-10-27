import { NextRequest, NextResponse } from "next/server";

import {
  TaskDependencyError,
  addTaskDependency,
  listTaskDependencies,
  removeTaskDependency,
} from "@/services/tasks/dependencies";
import { WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "task-dependencies-route";
type RouteContext = { params: Promise<{ id: string }> };

function dependencyError(error: TaskDependencyError) {
  const status =
    error.code === "TASK_NOT_FOUND"
      ? 404
      : error.code === "DEPENDENCY_CYCLE" ||
          error.code === "DUPLICATE_DEPENDENCY" ||
          error.code === "CROSS_PROJECT_DEPENDENCY" ||
          error.code === "PROJECT_ARCHIVED"
        ? 409
        : 400;
  return NextResponse.json({ error: error.code }, { status });
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;

  try {
    const { id } = await params;
    return NextResponse.json(
      await listTaskDependencies(
        { userId: auth.userId, workspace: auth.workspace },
        id
      )
    );
  } catch (error) {
    if (error instanceof TaskDependencyError) return dependencyError(error);
    logger.error(
      "Failed to list task dependencies",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.EDITOR,
  });
  if ("response" in auth) return auth.response;

  try {
    const { id } = await params;
    const body = ((await request.json().catch(() => null)) ?? {}) as {
      blockerTaskId?: unknown;
    };
    if (typeof body.blockerTaskId !== "string") {
      return NextResponse.json(
        { error: "blockerTaskId is required" },
        { status: 400 }
      );
    }
    const dependency = await addTaskDependency({
      userId: auth.userId,
      workspace: auth.workspace,
      blockerTaskId: body.blockerTaskId,
      blockedTaskId: id,
    });
    return NextResponse.json({ dependency }, { status: 201 });
  } catch (error) {
    if (error instanceof TaskDependencyError) return dependencyError(error);
    logger.error(
      "Failed to add task dependency",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.EDITOR,
  });
  if ("response" in auth) return auth.response;

  try {
    const dependencyId = request.nextUrl.searchParams.get("dependencyId");
    if (!dependencyId) {
      return NextResponse.json(
        { error: "dependencyId is required" },
        { status: 400 }
      );
    }
    await removeTaskDependency({
      userId: auth.userId,
      workspace: auth.workspace,
      dependencyId,
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof TaskDependencyError) return dependencyError(error);
    logger.error(
      "Failed to remove task dependency",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
