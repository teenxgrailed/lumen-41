import { NextRequest, NextResponse } from "next/server";

import { PageAccessRole, WorkspaceRole } from "@prisma/client";

import { recordActivation } from "@/lib/activation-events";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { resolvePageAccess } from "@/lib/auth/page-auth";
import { prisma } from "@/lib/prisma";

import { ProjectStatus } from "@/types/project";

const LOG_SOURCE = "PageInlineEntitiesAPI";
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.EDITOR,
  });
  if ("response" in auth) return auth.response;
  const { id: pageId } = await params;
  const workspaceId = auth.workspace?.workspaceId;
  if (!workspaceId) {
    return NextResponse.json(
      { error: "Workspace is required" },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const type =
    body.type === "task" || body.type === "project" ? body.type : null;
  const title =
    typeof body.title === "string" ? body.title.trim().slice(0, 240) : "";
  if (!type || !title) {
    return NextResponse.json(
      { error: "A type and title are required" },
      { status: 400 }
    );
  }

  if (!(await resolvePageAccess(auth, pageId, PageAccessRole.EDITOR)))
    return NextResponse.json({ error: "Page access denied" }, { status: 403 });

  if (type === "task") {
    const task = await prisma.task.create({
      data: {
        title,
        status: "todo",
        userId: auth.userId,
        workspaceId,
        assigneeId: auth.userId,
        activities: {
          create: {
            workspaceId,
            actorId: auth.userId,
            action: "CREATED",
          },
        },
      },
      select: { id: true, title: true },
    });
    recordActivation("task_created", auth.userId, { source: "page" });
    return NextResponse.json(
      {
        entity: {
          type,
          id: task.id,
          title: task.title,
          href: `/tasks?taskId=${task.id}`,
        },
      },
      { status: 201 }
    );
  }

  const project = await prisma.project.create({
    data: {
      name: title,
      status: ProjectStatus.ACTIVE,
      userId: auth.userId,
      workspaceId,
    },
    select: { id: true, name: true },
  });
  return NextResponse.json(
    {
      entity: {
        type,
        id: project.id,
        title: project.name,
        href: `/projects/${project.id}`,
      },
    },
    { status: 201 }
  );
}
