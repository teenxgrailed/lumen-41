import { NextRequest, NextResponse } from "next/server";

import { listItems } from "@/services/agent-hub/items";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { workspaceDataScopeWhere } from "@/lib/auth/workspace-auth";
import { normalizeUserTimeZone } from "@/lib/habit-completion-date";
import { logger } from "@/lib/logger";
import { notesText } from "@/lib/needt3/derive";
import { isoToDay } from "@/lib/needt3/map";
import {
  type RoadmapHubItem,
  type RoadmapTask,
  buildRoadmap,
} from "@/lib/needt3/roadmap";
import { prisma } from "@/lib/prisma";
import { activeProjectTaskWhere } from "@/lib/projects/archive";
import { openTaskWhere } from "@/lib/tasks/open-task";

const LOG_SOURCE = "project-roadmap-route";
const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" } as const;
type RouteContext = { params: Promise<{ id: string }> };

/**
 * `GET /api/projects/[id]/roadmap`: the project's roadmap, computed the same
 * way the Roadmap screens compute it (`buildRoadmap`): stations in board
 * order, each `done | current | next | blocked`, the waits between them as
 * edges, and (when the agent hub is on for the account) the agent working on
 * each milestone. Read-only. Nothing is stored; the answer is derived from
 * the project's tasks every time.
 *
 * `?hub=0` leaves the agents out. Dates are in the account's time zone.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) return auth.response;

    const { id } = await params;
    const scope = workspaceDataScopeWhere(auth.workspace, auth.userId);
    const project = await prisma.project.findFirst({
      where: { id, ...scope },
      select: { id: true, name: true, status: true },
    });
    if (!project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404, headers: NO_STORE }
      );
    }

    const [rows, settings] = await Promise.all([
      // Every task, not only this project's: a blocker in another project
      // still blocks a station here.
      prisma.task.findMany({
        where: {
          ...scope,
          ...openTaskWhere(),
          isArchived: false,
          AND: [activeProjectTaskWhere],
        },
        select: {
          id: true,
          title: true,
          description: true,
          status: true,
          projectId: true,
          dependsOnId: true,
          createdAt: true,
          dueDate: true,
          deadline: true,
          isRecurring: true,
          recurrenceRule: true,
          trashedAt: true,
          parts: { select: { done: true } },
        },
        orderBy: { createdAt: "asc" },
        take: 5000,
      }),
      prisma.userSettings.findUnique({
        where: { userId: auth.userId },
        select: { timeZone: true },
      }),
    ]);
    const tz = normalizeUserTimeZone(settings?.timeZone);

    const tasks: RoadmapTask[] = rows.map((row) => ({
      id: row.id,
      title: row.title,
      done: row.status === "completed",
      status: row.status,
      projectId: row.projectId ?? null,
      blockedBy: row.dependsOnId ?? null,
      notes: notesText(row.description),
      createdAt: row.createdAt.toISOString(),
      dueDate: isoToDay(row.dueDate?.toISOString(), tz),
      deadline: isoToDay(row.deadline?.toISOString(), tz),
      parts: row.parts,
      repeat: row.isRecurring ? (row.recurrenceRule ?? null) : null,
      trashedAt: row.trashedAt?.toISOString() ?? null,
    }));

    let hub: RoadmapHubItem[] = [];
    if (request.nextUrl.searchParams.get("hub") !== "0" && auth.workspace) {
      // The agents are decoration: a hub that cannot be read leaves the map whole.
      try {
        const items = await listItems({
          userId: auth.userId,
          workspaceId: auth.workspace.workspaceId,
        });
        hub = items.map((i) => ({
          id: i.id,
          title: i.title,
          status: i.status,
          taskId: i.taskId ?? null,
          agent:
            i.heldBy?.name ??
            (i.assignee && typeof i.assignee === "object"
              ? (i.assignee.name ?? null)
              : null),
          updatedAt: i.updatedAt,
        }));
      } catch (error) {
        logger.warn(
          "Roadmap read without the agent hub",
          { error: error instanceof Error ? error.message : String(error) },
          LOG_SOURCE
        );
      }
    }

    return NextResponse.json(
      {
        project: { id: project.id, name: project.name, status: project.status },
        timeZone: tz,
        roadmap: buildRoadmap(project.id, tasks, hub),
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    logger.error(
      "Error reading the roadmap",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
