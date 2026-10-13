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

const LOG_SOURCE = "projects-route";

function optionalDate(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const parsed = newDate(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) return auth.response;

    const { searchParams } = new URL(request.url);
    const status = searchParams.getAll("status") as ProjectStatus[];
    const search = searchParams.get("search");

    const projects = await prisma.project.findMany({
      where: {
        ...workspaceDataScopeWhere(auth.workspace, auth.userId),
        ...(status.length > 0 && { status: { in: status } }),
        ...(search && {
          OR: [
            { name: { contains: search } },
            { description: { contains: search } },
          ],
        }),
      },
      include: {
        tasks: {
          where: { isArchived: false },
          select: { status: true, isArchived: true },
        },
        stages: {
          orderBy: { position: "asc" },
          include: {
            tasks: {
              where: { isArchived: false },
              select: { status: true, isArchived: true },
            },
          },
        },
        blockers: {
          where: { resolvedAt: null },
          select: { id: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(
      projects.map(({ tasks, stages, blockers, ...project }) => ({
        ...project,
        ...deriveProjectProgress(tasks),
        stages: stages.map(({ tasks: stageTasks, ...stage }) => ({
          ...stage,
          ...deriveProjectProgress(stageTasks),
        })),
        blockerCount: blockers.length,
        _count: { tasks: tasks.length },
      }))
    );
  } catch (error) {
    logger.error(
      "Error fetching projects:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE, {
      requiredRole: WorkspaceRole.EDITOR,
    });
    if ("response" in auth) return auth.response;
    const workspaceId = auth.workspace?.workspaceId;
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace is required" },
        { status: 400 }
      );
    }

    const json = (await request.json()) as Record<string, unknown>;
    const name = typeof json.name === "string" ? json.name.trim() : "";
    const v3 = parseV3Fields(projectV3FieldsSchema, json);
    if (!v3.ok) return NextResponse.json({ error: v3.error }, { status: 400 });
    const startDate = optionalDate(json.startDate);
    const deadline = optionalDate(json.deadline);
    if (!name || startDate === undefined || deadline === undefined) {
      return NextResponse.json(
        { error: "Invalid project input" },
        { status: 400 }
      );
    }
    if (startDate && deadline && startDate > deadline) {
      return NextResponse.json(
        { error: "Project start must not be after its deadline" },
        { status: 400 }
      );
    }

    const project = await prisma.project.create({
      data: {
        name,
        description:
          typeof json.description === "string"
            ? json.description.trim() || null
            : null,
        color: typeof json.color === "string" ? json.color : null,
        icon: typeof json.icon === "string" ? json.icon : null,
        startDate,
        deadline,
        status:
          json.status === ProjectStatus.ARCHIVED
            ? ProjectStatus.ARCHIVED
            : ProjectStatus.ACTIVE,
        userId: auth.userId,
        workspaceId,
        ...v3.data,
      },
    });

    return NextResponse.json(
      { ...project, completed: 0, total: 0, progress: 0, _count: { tasks: 0 } },
      { status: 201 }
    );
  } catch (error) {
    logger.error(
      "Error creating project:",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
