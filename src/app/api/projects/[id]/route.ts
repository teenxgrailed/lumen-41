import { NextRequest, NextResponse } from "next/server";

import { WorkspaceRole } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { workspaceDataScopeWhere } from "@/lib/auth/workspace-auth";
import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import {
  parseV3Fields,
  projectV3FieldsSchema,
} from "@/lib/needt3/api-fields";
import { prisma } from "@/lib/prisma";
import { deriveProjectProgress } from "@/lib/projects/progress";

import { ProjectStatus } from "@/types/project";

const LOG_SOURCE = "project-route";
type RouteContext = { params: Promise<{ id: string }> };

function optionalDate(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") return false;
  const parsed = newDate(value);
  return Number.isNaN(parsed.getTime()) ? false : parsed;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) return auth.response;

    const { id } = await params;
    const project = await prisma.project.findFirst({
      where: {
        id,
        ...workspaceDataScopeWhere(auth.workspace, auth.userId),
      },
      include: {
        tasks: {
          where: { isArchived: false },
          include: {
            tags: true,
            assignee: {
              select: { id: true, name: true, email: true, image: true },
            },
            stage: true,
            blockedByDependencies: {
              where: { removedAt: null },
              include: {
                blocker: { select: { id: true, title: true, status: true } },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        stages: { orderBy: { position: "asc" } },
        blockers: {
          include: {
            task: { select: { id: true, title: true, status: true } },
            stage: { select: { id: true, name: true } },
            blockerTask: { select: { id: true, title: true, status: true } },
            createdBy: { select: { id: true, name: true, image: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!project) {
      return new NextResponse("Project not found", { status: 404 });
    }

    return NextResponse.json({
      ...project,
      ...deriveProjectProgress(project.tasks),
      _count: { tasks: project.tasks.length },
    });
  } catch (error) {
    logger.error(
      "Error fetching project:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE, {
      requiredRole: WorkspaceRole.EDITOR,
    });
    if ("response" in auth) return auth.response;

    const { id } = await params;
    const existing = await prisma.project.findFirst({
      where: { id, ...workspaceDataScopeWhere(auth.workspace, auth.userId) },
      select: { id: true, startDate: true, deadline: true, status: true },
    });
    if (!existing) {
      return new NextResponse("Project not found", { status: 404 });
    }

    const json = (await request.json()) as Record<string, unknown>;
    if (
      existing.status === ProjectStatus.ARCHIVED &&
      (json.status !== ProjectStatus.ACTIVE || Object.keys(json).length !== 1)
    ) {
      return NextResponse.json({ error: "PROJECT_ARCHIVED" }, { status: 409 });
    }
    const v3 = parseV3Fields(projectV3FieldsSchema, json);
    if (!v3.ok) return NextResponse.json({ error: v3.error }, { status: 400 });
    const startDate = optionalDate(json.startDate);
    const deadline = optionalDate(json.deadline);
    if (startDate === false || deadline === false) {
      return NextResponse.json(
        { error: "Invalid project date" },
        { status: 400 }
      );
    }
    const nextStart = startDate === undefined ? existing.startDate : startDate;
    const nextDeadline = deadline === undefined ? existing.deadline : deadline;
    if (nextStart && nextDeadline && nextStart > nextDeadline) {
      return NextResponse.json(
        { error: "Project start must not be after its deadline" },
        { status: 400 }
      );
    }
    if (
      json.name !== undefined &&
      (typeof json.name !== "string" || !json.name.trim())
    ) {
      return NextResponse.json(
        { error: "Project name is required" },
        { status: 400 }
      );
    }

    const project = await prisma.project.update({
      where: { id, ...workspaceDataScopeWhere(auth.workspace, auth.userId) },
      data: {
        name: typeof json.name === "string" ? json.name.trim() : undefined,
        description:
          typeof json.description === "string"
            ? json.description.trim() || null
            : json.description === null
              ? null
              : undefined,
        color:
          typeof json.color === "string"
            ? json.color
            : json.color === null
              ? null
              : undefined,
        icon:
          typeof json.icon === "string"
            ? json.icon
            : json.icon === null
              ? null
              : undefined,
        startDate,
        deadline,
        status:
          json.status === ProjectStatus.ACTIVE ||
          json.status === ProjectStatus.ARCHIVED
            ? json.status
            : undefined,
        ...v3.data,
      },
      include: {
        tasks: {
          where: { isArchived: false },
          select: { status: true, isArchived: true },
        },
      },
    });

    const { tasks, ...result } = project;
    return NextResponse.json({
      ...result,
      ...deriveProjectProgress(tasks),
      _count: { tasks: tasks.length },
    });
  } catch (error) {
    logger.error(
      "Error updating project:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE, {
      requiredRole: WorkspaceRole.EDITOR,
    });
    if ("response" in auth) return auth.response;

    const { id } = await params;
    const project = await prisma.project.findFirst({
      where: { id, ...workspaceDataScopeWhere(auth.workspace, auth.userId) },
      include: {
        tasks: {
          where: { isArchived: false },
          select: { status: true, isArchived: true },
        },
      },
    });
    if (!project) {
      return new NextResponse("Project not found", { status: 404 });
    }

    const archived = await prisma.project.update({
      where: { id, ...workspaceDataScopeWhere(auth.workspace, auth.userId) },
      data: { status: ProjectStatus.ARCHIVED },
    });

    return NextResponse.json({
      ...archived,
      ...deriveProjectProgress(project.tasks),
      _count: { tasks: project.tasks.length },
    });
  } catch (error) {
    logger.error(
      "Error archiving project:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
