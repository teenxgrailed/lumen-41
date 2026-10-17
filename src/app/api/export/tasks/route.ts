import { NextRequest, NextResponse } from "next/server";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { workspaceDataScopeWhere } from "@/lib/auth/workspace-auth";
import { tasksToCsv } from "@/lib/export/tasks-csv";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "export-tasks-api";

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE);
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;
    const scope = workspaceDataScopeWhere(auth.workspace, userId);

    // Get the includeCompleted parameter from the query string
    const includeCompleted =
      request.nextUrl.searchParams.get("includeCompleted") === "true";

    // Fetch all tasks for the user
    const tasks = await prisma.task.findMany({
      where: {
        ...scope,
        // Filter out completed tasks if includeCompleted is false
        ...(includeCompleted ? {} : { status: { not: "completed" } }),
      },
      include: {
        tags: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    // Fetch all projects for the user
    const projects = await prisma.project.findMany({
      where: {
        ...scope,
      },
      orderBy: {
        name: "asc",
      },
    });

    // Fetch all tags for the user
    const tags = await prisma.tag.findMany({
      where: {
        tasks: { some: scope },
      },
      orderBy: {
        name: "asc",
      },
    });

    // Create the export data structure
    const projectById = new Map(
      projects.map((project) => [project.id, project])
    );
    const exportData = {
      metadata: {
        exportDate: new Date().toISOString(),
        version: "1.0",
        includeCompleted,
      },
      tasks: tasks.map((task) => ({
        ...task,
        project: task.projectId
          ? (projectById.get(task.projectId) ?? null)
          : null,
      })),
      projects,
      tags,
    };

    logger.info(
      "Tasks exported",
      {
        userId,
        taskCount: tasks.length,
        projectCount: projects.length,
        tagCount: tags.length,
        includeCompleted,
      },
      LOG_SOURCE
    );

    // ?format=csv: one row per task for a spreadsheet. JSON stays the default
    // and the lossless one.
    if (request.nextUrl.searchParams.get("format") === "csv") {
      return new NextResponse(
        tasksToCsv(
          exportData.tasks.map((task) => ({
            ...task,
            estimatedMinutes: task.estimatedMinutes ?? task.duration,
          }))
        ),
        {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": 'attachment; filename="needt-tasks.csv"',
            "Cache-Control": "no-store",
          },
        }
      );
    }

    return NextResponse.json(exportData);
  } catch (error) {
    logger.error(
      "Error exporting tasks",
      {
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to export tasks" },
      { status: 500 }
    );
  }
}
