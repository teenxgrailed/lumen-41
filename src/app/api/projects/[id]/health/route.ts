import { NextRequest, NextResponse } from "next/server";

import { ProjectHealthStatus, WorkspaceRole } from "@prisma/client";
import { z } from "zod";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { workspaceDataScopeWhere } from "@/lib/auth/workspace-auth";
import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "ProjectHealthAPI";
type RouteContext = { params: Promise<{ id: string }> };
const updateSchema = z.object({
  status: z.nativeEnum(ProjectHealthStatus),
  summary: z.string().trim().min(1).max(2000),
  expectedVersion: z.number().int().min(0),
});

export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const { id } = await params;
  const project = await prisma.project.findFirst({
    where: { id, ...workspaceDataScopeWhere(auth.workspace, auth.userId) },
    select: {
      id: true,
      healthStatus: true,
      healthVersion: true,
      healthUpdatedAt: true,
      healthUpdates: {
        orderBy: { version: "desc" },
        take: 50,
        include: {
          author: { select: { id: true, name: true, image: true } },
        },
      },
    },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  return NextResponse.json(project);
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateRequest(request, LOG_SOURCE, {
    requiredRole: WorkspaceRole.EDITOR,
  });
  if ("response" in auth) return auth.response;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid health update" }, { status: 400 });
  const { id } = await params;
  const existing = await prisma.project.findFirst({
    where: { id, ...workspaceDataScopeWhere(auth.workspace, auth.userId) },
    select: { healthStatus: true, healthVersion: true, workspaceId: true },
  });
  if (!existing) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (existing.healthVersion !== parsed.data.expectedVersion) {
    return NextResponse.json(
      {
        error: "Project health changed. Refresh before posting an update.",
        code: "PROJECT_HEALTH_STALE",
        currentVersion: existing.healthVersion,
      },
      { status: 409 }
    );
  }
  const workspaceId = existing.workspaceId ?? auth.workspace!.workspaceId;
  const nextVersion = existing.healthVersion + 1;
  const created = await prisma.$transaction(async (tx) => {
    const updated = await tx.project.updateMany({
      where: {
        id,
        ...workspaceDataScopeWhere(auth.workspace, auth.userId),
        healthVersion: existing.healthVersion,
      },
      data: {
        healthStatus: parsed.data.status,
        healthVersion: { increment: 1 },
        healthUpdatedAt: newDate(),
      },
    });
    if (updated.count !== 1) return null;
    return tx.projectHealthUpdate.create({
      data: {
        workspaceId,
        projectId: id,
        authorId: auth.userId,
        status: parsed.data.status,
        previousStatus: existing.healthStatus,
        summary: parsed.data.summary,
        version: nextVersion,
      },
    });
  });
  if (!created) {
    return NextResponse.json(
      { error: "Project health changed.", code: "PROJECT_HEALTH_STALE" },
      { status: 409 }
    );
  }
  return NextResponse.json({ update: created, healthVersion: nextVersion }, { status: 201 });
}
