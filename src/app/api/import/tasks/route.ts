import { NextRequest, NextResponse } from "next/server";

import {
  Prisma,
  SchedulingEnergyLevel,
  SchedulingTaskPriority,
  WorkspaceRole,
} from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { workspaceDataScopeWhere } from "@/lib/auth/workspace-auth";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { Project } from "@/types/project";
import { Tag, Task } from "@/types/task";

const LOG_SOURCE = "import-tasks-api";

// Define types for import data
type ImportTag = Omit<Tag, "tasks">;
type ImportProject = Omit<Project, "tasks">;
type ImportTask = Omit<Task, "tags" | "project"> & {
  tags?: { id: string; name: string; color?: string | null }[];
  externalTaskId?: string | null;
  source?: string | null;
  lastSyncedAt?: Date | null;
};

interface ImportData {
  metadata?: {
    exportDate: string;
    version: string;
    includeCompleted: boolean;
  };
  tasks: ImportTask[];
  tags?: ImportTag[];
  projects?: ImportProject[];
}

interface ExportedTaskExtras {
  startDate?: string | null;
  deadline?: string | null;
  availableFrom?: string | null;
  hardDeadline?: boolean;
  estimatedMinutes?: number | null;
  priorityLevel?: SchedulingTaskPriority;
  energyRequired?: SchedulingEnergyLevel;
  contextTag?: string | null;
  isArchived?: boolean;
  archivedAt?: string | null;
}

/** Parse an exported date; anything unparseable is null (never an Invalid Date). */
export function parseImportDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value as string | number | Date);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Interactive transactions default to 5s; a restore of a few hundred tasks
// needs far more.
const IMPORT_TX_OPTIONS = { timeout: 120_000, maxWait: 10_000 };

// Helper function to validate the import data structure
function validateImportData(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const importData = data as ImportData;
  if (!Array.isArray(importData.tasks)) return false;

  // Basic validation of tasks
  for (const task of importData.tasks) {
    if (!task.title || typeof task.title !== "string") return false;
    if (!task.status || typeof task.status !== "string") return false;
  }

  return true;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request, LOG_SOURCE, {
      requiredRole: WorkspaceRole.EDITOR,
    });
    if ("response" in auth) {
      return auth.response;
    }

    const userId = auth.userId;
    const workspaceId = auth.workspace!.workspaceId;
    const data = (await request.json()) as ImportData;

    // Validate the import data
    if (!validateImportData(data)) {
      logger.warn("Invalid import data format", { userId }, LOG_SOURCE);
      return NextResponse.json(
        { error: "Invalid import data format" },
        { status: 400 }
      );
    }

    // Start a transaction to ensure data consistency
    const result = await prisma.$transaction(async (tx) => {
      // Import tags first (if any)
      const tagMap = new Map<string, string>(); // Map old tag IDs to new tag IDs

      if (Array.isArray(data.tags)) {
        for (const tag of data.tags) {
          // Check if a tag with the same name already exists for this user
          const existingTag = await tx.tag.findFirst({
            where: {
              userId,
              name: tag.name,
            },
          });

          if (existingTag) {
            // Use the existing tag
            tagMap.set(tag.id, existingTag.id);
          } else {
            // Create a new tag
            const newTag = await tx.tag.create({
              data: {
                name: tag.name,
                color: tag.color,
                userId,
              },
            });
            tagMap.set(tag.id, newTag.id);
          }
        }
      }

      // Import projects (if any)
      const projectMap = new Map<string, string>(); // Map old project IDs to new project IDs

      if (Array.isArray(data.projects)) {
        for (const project of data.projects) {
          // Check if a project with the same name already exists for this user
          const existingProject = await tx.project.findFirst({
            where: {
              ...workspaceDataScopeWhere(auth.workspace, userId),
              name: project.name,
            },
          });

          if (existingProject) {
            // Use the existing project
            projectMap.set(project.id, existingProject.id);
          } else {
            // Create a new project
            const newProject = await tx.project.create({
              data: {
                name: project.name,
                description: project.description,
                color: project.color,
                status: project.status || "active",
                userId,
                workspaceId,
              },
            });
            projectMap.set(project.id, newProject.id);
          }
        }
      }

      // Import tasks
      let importedCount = 0;
      const skipped: { title: string; error: string }[] = [];

      for (const task of data.tasks) {
        try {
          // Map the tag IDs
          const tagIds =
            (task.tags
              ?.map((tag) => tagMap.get(tag.id) || null)
              .filter(Boolean) as string[]) || [];

          // Map the project ID
          const projectId = task.projectId
            ? projectMap.get(task.projectId) || null
            : null;

          // Fields the typed Task shape does not list but the export carries.
          const raw = task as unknown as ExportedTaskExtras;

          // Create the task with proper type handling
          const taskData = {
            title: task.title,
            description: task.description,
            status: task.status,
            dueDate: parseImportDate(task.dueDate),
            startDate: parseImportDate(raw.startDate),
            deadline: parseImportDate(raw.deadline),
            availableFrom: parseImportDate(raw.availableFrom),
            ...(typeof raw.hardDeadline === "boolean"
              ? { hardDeadline: raw.hardDeadline }
              : {}),
            ...(typeof raw.estimatedMinutes === "number"
              ? { estimatedMinutes: raw.estimatedMinutes }
              : {}),
            ...(raw.priorityLevel ? { priorityLevel: raw.priorityLevel } : {}),
            ...(raw.energyRequired
              ? { energyRequired: raw.energyRequired }
              : {}),
            contextTag: raw.contextTag ?? null,
            isArchived: raw.isArchived === true,
            archivedAt: parseImportDate(raw.archivedAt),
            duration: task.duration,
            priority: task.priority,
            energyLevel: task.energyLevel,
            preferredTime: task.preferredTime,
            isAutoScheduled: task.isAutoScheduled || false,
            scheduleLocked: task.scheduleLocked || false,
            scheduledStart: parseImportDate(task.scheduledStart),
            scheduledEnd: parseImportDate(task.scheduledEnd),
            scheduleScore: task.scheduleScore,
            lastScheduled: parseImportDate(task.lastScheduled),
            isRecurring: task.isRecurring || false,
            recurrenceRule: task.recurrenceRule,
            lastCompletedDate: parseImportDate(task.lastCompletedDate),
            completedAt: parseImportDate(task.completedAt),
            postponedUntil: parseImportDate(task.postponedUntil),
            externalTaskId: task.externalTaskId,
            source: task.source,
            lastSyncedAt: parseImportDate(task.lastSyncedAt),
            createdAt: parseImportDate(task.createdAt) ?? new Date(),
            updatedAt: new Date(),
          };

          // Add project connection if needed
          if (projectId) {
            await tx.task.create({
              data: {
                ...taskData,
                user: { connect: { id: userId } },
                workspace: { connect: { id: workspaceId } },
                assignee: { connect: { id: userId } },
                project: { connect: { id: projectId } },
                activities: {
                  create: { workspaceId, actorId: userId, action: "IMPORTED" },
                },
                ...(tagIds.length > 0
                  ? {
                      tags: { connect: tagIds.map((id) => ({ id })) },
                    }
                  : {}),
              },
            });
          } else {
            // Create without project connection
            await tx.task.create({
              data: {
                ...taskData,
                user: { connect: { id: userId } },
                workspace: { connect: { id: workspaceId } },
                assignee: { connect: { id: userId } },
                activities: {
                  create: { workspaceId, actorId: userId, action: "IMPORTED" },
                },
                ...(tagIds.length > 0
                  ? {
                      tags: { connect: tagIds.map((id) => ({ id })) },
                    }
                  : {}),
              },
            });
          }

          importedCount++;
        } catch (taskError) {
          // A database error aborts the Postgres transaction: every later
          // statement would fail too. Fail loudly and roll back instead.
          if (
            taskError instanceof Prisma.PrismaClientKnownRequestError ||
            taskError instanceof Prisma.PrismaClientUnknownRequestError
          ) {
            throw taskError;
          }
          skipped.push({
            title: String(task.title),
            error:
              taskError instanceof Error ? taskError.message : "Unknown error",
          });
          logger.warn(
            "Error importing individual task",
            {
              error:
                taskError instanceof Error
                  ? taskError.message
                  : String(taskError),
              taskTitle: task.title,
            },
            LOG_SOURCE
          );
          // Continue with the next task
        }
      }

      return { importedCount, skipped };
    }, IMPORT_TX_OPTIONS);

    logger.info(
      "Tasks imported successfully",
      {
        userId,
        importedCount: result.importedCount,
        skippedCount: result.skipped.length,
      },
      LOG_SOURCE
    );

    return NextResponse.json({
      success: true,
      imported: result.importedCount,
      skipped: result.skipped.length,
      skippedTasks: result.skipped.slice(0, 50),
    });
  } catch (error) {
    logger.error(
      "Error importing tasks",
      {
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Failed to import tasks" },
      { status: 500 }
    );
  }
}
