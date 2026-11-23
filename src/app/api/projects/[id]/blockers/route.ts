import { NextRequest, NextResponse } from "next/server";

import { wouldCreateDependencyCycle } from "@/services/tasks/dependencies";
import { WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { workspaceDataScopeWhere } from "@/lib/auth/workspace-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { openTaskWhere } from "@/lib/tasks/open-task";

const LOG_SOURCE = "project-blockers-route";
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE, {
      requiredRole: WorkspaceRole.EDITOR,
    });
    if ("response" in auth) return auth.response;

    const { id: projectId } = await params;
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        status: "active",
        ...workspaceDataScopeWhere(auth.workspace, auth.userId),
      },
      select: { id: true },
    });
    if (!project) return new NextResponse("Project not found", { status: 404 });

    const body = (await request.json()) as Record<string, unknown>;
    const taskId = typeof body.taskId === "string" ? body.taskId : null;
    const stageId = typeof body.stageId === "string" ? body.stageId : null;
    const blockerTaskId =
      typeof body.blockerTaskId === "string" ? body.blockerTaskId : null;
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (
      Number(Boolean(taskId)) + Number(Boolean(stageId)) !== 1 ||
      Number(Boolean(blockerTaskId)) + Number(Boolean(title)) !== 1 ||
      (taskId && taskId === blockerTaskId)
    ) {
      return NextResponse.json(
        { error: "Invalid blocker input" },
        { status: 400 }
      );
    }

    const taskIds = [taskId, blockerTaskId].filter((value): value is string =>
      Boolean(value)
    );
    const [taskCount, stageCount] = await Promise.all([
      taskIds.length
        ? prisma.task.count({
            where: { id: { in: taskIds }, projectId, ...openTaskWhere() },
          })
        : Promise.resolve(0),
      stageId
        ? prisma.projectStage.count({ where: { id: stageId, projectId } })
        : Promise.resolve(0),
    ]);
    if (taskCount !== taskIds.length || (stageId && stageCount !== 1)) {
      return NextResponse.json(
        { error: "Blocker items must belong to this project" },
        { status: 400 }
      );
    }
    if (taskId && blockerTaskId) {
      const edges = await prisma.projectBlocker.findMany({
        where: {
          projectId,
          resolvedAt: null,
          taskId: { not: null },
          blockerTaskId: { not: null },
        },
        select: { taskId: true, blockerTaskId: true },
      });
      if (
        wouldCreateDependencyCycle(
          edges.flatMap((edge) =>
            edge.taskId && edge.blockerTaskId
              ? [
                  {
                    blockerTaskId: edge.blockerTaskId,
                    blockedTaskId: edge.taskId,
                  },
                ]
              : []
          ),
          blockerTaskId,
          taskId
        )
      ) {
        return NextResponse.json(
          { error: "DEPENDENCY_CYCLE" },
          { status: 409 }
        );
      }
    }

    const blocker = await prisma.projectBlocker.create({
      data: {
        projectId,
        taskId,
        stageId,
        blockerTaskId,
        title: title || null,
        createdById: auth.userId,
      },
      include: {
        task: { select: { id: true, title: true, status: true } },
        stage: { select: { id: true, name: true } },
        blockerTask: { select: { id: true, title: true, status: true } },
      },
    });
    return NextResponse.json(blocker, { status: 201 });
  } catch (error) {
    logger.error(
      "Failed to create project blocker",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
