import { NextRequest, NextResponse } from "next/server";

import { WorkspaceRole } from "@prisma/client";
import { z } from "zod";

import { routeErrorResponse } from "@/lib/api/route-error";
import { authenticateRequest } from "@/lib/auth/api-auth";
import { workspaceDataScopeWhere } from "@/lib/auth/workspace-auth";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "WeekFocusAPI";

/** The most focuses a week holds. */
const WEEK_FOCUS_MAX = 3;

const dayText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const focusSchema = z.object({
  /** A snapshot of the task's or project's name when it was picked. */
  title: z.string().trim().min(1).max(160),
  taskId: z.string().min(1).max(64).nullish(),
  projectId: z.string().min(1).max(64).nullish(),
});

const weekFocusBodySchema = z.object({
  weekStart: dayText,
  focuses: z.array(focusSchema).min(1).max(WEEK_FOCUS_MAX),
});

interface Focus {
  title: string;
  taskId: string | null;
  projectId: string | null;
}

/**
 * The stored JSON as a clean list; anything malformed is dropped. Entries from
 * before references existed (a bare string, or a title with a null taskId) are
 * still read, as titles with no reference.
 */
function focusesOf(value: unknown): Focus[] {
  if (!Array.isArray(value)) return [];
  const out: Focus[] = [];
  for (const raw of value) {
    const parsed = focusSchema.safeParse(
      typeof raw === "string" ? { title: raw } : raw
    );
    if (parsed.success)
      out.push({
        title: parsed.data.title,
        taskId: parsed.data.taskId ?? null,
        projectId: parsed.data.projectId ?? null,
      });
  }
  return out.slice(0, WEEK_FOCUS_MAX);
}

const shape = (row: { weekStart: string; focuses: unknown } | null) =>
  row ? { weekStart: row.weekStart, focuses: focusesOf(row.focuses) } : null;

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

/**
 * GET /api/week-focus?weekStart=YYYY-MM-DD -> { weekFocus } | { weekFocus: null }
 * The focuses picked in the Sunday review for the week that starts that day.
 */
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request, LOG_SOURCE);
  if ("response" in auth) return auth.response;
  const weekStart = dayText.safeParse(
    request.nextUrl.searchParams.get("weekStart")
  );
  if (!weekStart.success) return bad("weekStart must be YYYY-MM-DD");
  if (!auth.workspace) {
    return NextResponse.json(
      { error: "Workspace unavailable" },
      { status: 500 }
    );
  }
  try {
    const row = await prisma.weekFocus.findUnique({
      where: {
        userId_workspaceId_weekStart: {
          userId: auth.userId,
          workspaceId: auth.workspace.workspaceId,
          weekStart: weekStart.data,
        },
      },
    });
    return NextResponse.json({ weekFocus: shape(row) });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to read the week focus",
      LOG_SOURCE,
      "Could not load the week's focuses."
    );
  }
}

/**
 * PUT { weekStart, focuses: [{ title, taskId? | projectId? }] } -> { weekFocus }
 * Replaces the week's focuses (1 to 3). A `taskId` must be a live task and a
 * `projectId` a project in the caller's scope; `title` is a snapshot of its
 * name when it was picked.
 */
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
  const body = weekFocusBodySchema.safeParse(
    await request.json().catch(() => ({}))
  );
  if (!body.success) {
    return bad("weekStart must be YYYY-MM-DD and focuses 1 to 3 titles");
  }
  try {
    const ids = [
      ...new Set(
        body.data.focuses.flatMap((f) => (f.taskId ? [f.taskId] : []))
      ),
    ];
    if (ids.length) {
      const found = await prisma.task.count({
        where: {
          id: { in: ids },
          trashedAt: null,
          ...workspaceDataScopeWhere(auth.workspace, auth.userId),
        },
      });
      if (found !== ids.length) {
        return NextResponse.json({ error: "Task not found" }, { status: 404 });
      }
    }
    const projectIds = [
      ...new Set(
        body.data.focuses.flatMap((f) => (f.projectId ? [f.projectId] : []))
      ),
    ];
    if (projectIds.length) {
      const found = await prisma.project.count({
        where: {
          id: { in: projectIds },
          workspaceId: auth.workspace.workspaceId,
        },
      });
      if (found !== projectIds.length) {
        return NextResponse.json(
          { error: "Project not found" },
          { status: 404 }
        );
      }
    }
    const key = {
      userId: auth.userId,
      workspaceId: auth.workspace.workspaceId,
      weekStart: body.data.weekStart,
    };
    const focuses = body.data.focuses.map((f) => ({
      title: f.title,
      taskId: f.taskId ?? null,
      projectId: f.projectId ?? null,
    }));
    const row = await prisma.weekFocus.upsert({
      where: { userId_workspaceId_weekStart: key },
      create: { ...key, focuses },
      update: { focuses },
    });
    return NextResponse.json({ weekFocus: shape(row) });
  } catch (error) {
    return routeErrorResponse(
      error,
      "Failed to save the week focus",
      LOG_SOURCE,
      "Could not save the week's focuses."
    );
  }
}
