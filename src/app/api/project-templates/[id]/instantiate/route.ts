import { NextRequest, NextResponse } from "next/server";

import { WorkspaceRole } from "@prisma/client";

import { recordActivation } from "@/lib/activation-events";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { addCalendarDays, newDate, startOfDay } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { resolveProjectRelativeDate } from "@/lib/projects/relative-dates";

import { ProjectStatus } from "@/types/project";
import { TaskStatus } from "@/types/task";

const LOG_SOURCE = "project-template-instantiate-route";
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE, {
      requiredRole: WorkspaceRole.EDITOR,
    });
    if ("response" in auth) return auth.response;

    const { id } = await params;
    const workspaceId = auth.workspace?.workspaceId;
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace is required" },
        { status: 400 }
      );
    }
    const template = await prisma.projectTemplate.findFirst({
      where: { id, workspaceId },
      include: {
        stages: { orderBy: { position: "asc" } },
        roles: true,
        tasks: { orderBy: { position: "asc" } },
        dependencies: true,
      },
    });
    if (!template) {
      return NextResponse.json(
        { error: "Template not found" },
        { status: 404 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const name =
      typeof body.name === "string" && body.name.trim()
        ? body.name.trim()
        : template.name;
    const requestedStart =
      typeof body.startDate === "string"
        ? newDate(body.startDate)
        : startOfDay(newDate());
    if (Number.isNaN(requestedStart.getTime())) {
      return NextResponse.json(
        { error: "Invalid project start date" },
        { status: 400 }
      );
    }
    const rawAssignments =
      body.roleAssignments &&
      typeof body.roleAssignments === "object" &&
      !Array.isArray(body.roleAssignments)
        ? (body.roleAssignments as Record<string, unknown>)
        : {};
    const roleAssignments = new Map<string, string>();
    for (const role of template.roles) {
      const userId = rawAssignments[role.id];
      if (typeof userId === "string" && userId)
        roleAssignments.set(role.id, userId);
    }
    const assignedUserIds = [...new Set(roleAssignments.values())];
    if (assignedUserIds.length > 0) {
      const membershipCount = await prisma.workspaceMember.count({
        where: { workspaceId, userId: { in: assignedUserIds } },
      });
      if (membershipCount !== assignedUserIds.length) {
        return NextResponse.json(
          { error: "Every placeholder must map to a workspace member" },
          { status: 400 }
        );
      }
    }

    const projectDeadline = template.stages.reduce<Date | null>(
      (latest, stage) => {
        if (stage.durationDays === null) return latest;
        const deadline = addCalendarDays(
          requestedStart,
          stage.startOffsetDays + stage.durationDays
        );
        return latest === null || deadline > latest ? deadline : latest;
      },
      null
    );

    const project = await prisma.$transaction(async (tx) => {
      const createdProject = await tx.project.create({
        data: {
          name,
          description: template.description,
          color: template.color,
          icon: template.icon,
          status: ProjectStatus.ACTIVE,
          startDate: requestedStart,
          deadline: projectDeadline,
          sourceTemplateId: template.id,
          userId: auth.userId,
          workspaceId,
        },
      });
      const stageMap = new Map<
        string,
        { id: string; startDate: Date | null; deadline: Date | null }
      >();
      for (const stage of template.stages) {
        const stageStart = addCalendarDays(
          requestedStart,
          stage.startOffsetDays
        );
        const stageDeadline =
          stage.durationDays === null
            ? null
            : addCalendarDays(stageStart, stage.durationDays);
        const createdStage = await tx.projectStage.create({
          data: {
            projectId: createdProject.id,
            name: stage.name,
            color: stage.color,
            position: stage.position,
            startDate: stageStart,
            deadline: stageDeadline,
            expectedDurationDays: stage.durationDays,
          },
        });
        stageMap.set(stage.id, {
          id: createdStage.id,
          startDate: stageStart,
          deadline: stageDeadline,
        });
      }

      const taskMap = new Map<string, string>();
      for (const task of template.tasks) {
        const stage = task.stageId
          ? (stageMap.get(task.stageId) ?? null)
          : null;
        const createdTask = await tx.task.create({
          data: {
            title: task.title,
            description: task.description,
            status: TaskStatus.TODO,
            projectId: createdProject.id,
            stageId: stage?.id ?? null,
            userId: auth.userId,
            workspaceId,
            assigneeId: task.roleId
              ? (roleAssignments.get(task.roleId) ?? null)
              : auth.userId,
            duration: task.estimatedMinutes,
            estimatedMinutes: task.estimatedMinutes,
            priority: task.priority,
            energyRequired: task.energyRequired,
            startDate: resolveProjectRelativeDate(
              stage,
              task.startAnchor,
              task.startOffsetDays
            ),
            deadline: resolveProjectRelativeDate(
              stage,
              task.deadlineAnchor,
              task.deadlineOffsetDays
            ),
            activities: {
              create: {
                workspaceId,
                actorId: auth.userId,
                action: "CREATED_FROM_TEMPLATE",
              },
            },
          },
        });
        taskMap.set(task.id, createdTask.id);
      }

      if (template.dependencies.length > 0) {
        await tx.taskDependency.createMany({
          data: template.dependencies.map((dependency) => ({
            userId: auth.userId,
            workspaceId,
            blockerTaskId: taskMap.get(dependency.blockerTaskId)!,
            blockedTaskId: taskMap.get(dependency.blockedTaskId)!,
          })),
        });
      }
      return tx.project.findUniqueOrThrow({
        where: { id: createdProject.id },
        include: {
          stages: { orderBy: { position: "asc" } },
          tasks: {
            where: { isArchived: false },
            orderBy: { createdAt: "asc" },
          },
        },
      });
    });

    /* After the transaction committed; once per instantiation. */
    if (project.tasks.length > 0) {
      recordActivation("task_created", auth.userId, {
        source: "project_template",
      });
    }
    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    logger.error(
      "Failed to instantiate project template",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return NextResponse.json({ error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
