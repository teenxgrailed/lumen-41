import type { ImportSource } from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";
import { sanitizeTaskDescriptionForStorage } from "@/lib/task-description-format";

import { TaskStatus } from "@/types/task";

import type { ImportLimitGuard, ImportStore } from "./types";

/**
 * The Prisma side of an import. Every read and write is scoped to the run's
 * user and workspace, so a stale or forged mapping can never touch somebody
 * else's data or another workspace: a mapped id outside them counts as
 * missing, a fresh row is created in the run's workspace and the mapping is
 * pointed at it.
 */
export function createPrismaImportStore(input: {
  userId: string;
  workspaceId: string;
  source: ImportSource;
  importRunId: string;
}): ImportStore {
  const { userId, workspaceId, source, importRunId } = input;
  const syncedAt = () => newDate();
  const projectChecks = new Map<string, boolean>();
  async function projectInWorkspace(projectId: string) {
    const known = projectChecks.get(projectId);
    if (known !== undefined) return known;
    const found = await prisma.project.findFirst({
      where: { id: projectId, userId, workspaceId },
      select: { id: true },
    });
    projectChecks.set(projectId, Boolean(found));
    return Boolean(found);
  }

  return {
    async findMappedId(entityType, externalId) {
      const row = await prisma.importItemMap.findUnique({
        where: {
          userId_source_externalId_entityType: {
            userId,
            source,
            externalId,
            entityType,
          },
        },
        select: { localId: true },
      });
      return row?.localId ?? null;
    },

    async saveMapping(entityType, externalId, localId, sourceUpdatedAt) {
      await prisma.importItemMap.upsert({
        where: {
          userId_source_externalId_entityType: {
            userId,
            source,
            externalId,
            entityType,
          },
        },
        update: { localId, importRunId, sourceUpdatedAt },
        create: {
          userId,
          source,
          externalId,
          entityType,
          localId,
          importRunId,
          sourceUpdatedAt,
        },
      });
    },

    async writeProject(existingId, project) {
      const data = {
        name: project.name,
        description: project.description,
        externalId: project.externalId,
        externalSource: source,
        lastSyncedAt: syncedAt(),
      };
      if (existingId) {
        const updated = await prisma.project.updateMany({
          where: { id: existingId, userId, workspaceId },
          data,
        });
        if (updated.count === 1) return { id: existingId };
      }
      const created = await prisma.project.create({
        data: {
          ...data,
          userId,
          workspaceId,
          status: "active",
          position: project.position,
        },
        select: { id: true },
      });
      return created;
    },

    async writeStage(existingId, stage, projectId) {
      if (existingId) {
        const updated = await prisma.projectStage.updateMany({
          where: {
            id: existingId,
            projectId,
            project: { userId, workspaceId },
          },
          data: { name: stage.name, position: stage.position },
        });
        if (updated.count === 1) return { id: existingId };
      }
      return prisma.projectStage.create({
        data: { projectId, name: stage.name, position: stage.position },
        select: { id: true },
      });
    },

    async ensureTag(tag) {
      return prisma.tag.upsert({
        where: { name_userId: { name: tag.name, userId } },
        update: {},
        create: { name: tag.name, userId },
        select: { id: true },
      });
    },

    async writeTask(existingId, task, refs) {
      // Never link a task to a project (or its stage) outside this run's
      // workspace, whatever a mapping says.
      const projectId =
        refs.projectId && (await projectInWorkspace(refs.projectId))
          ? refs.projectId
          : null;
      const data = {
        title: task.title,
        description:
          sanitizeTaskDescriptionForStorage(task.description) ?? null,
        dueDate: task.dueDate,
        deadline: task.deadline,
        estimatedMinutes: task.estimatedMinutes,
        duration: task.estimatedMinutes,
        priorityLevel: task.priorityLevel,
        isRecurring: Boolean(task.recurrenceRule),
        recurrenceRule: task.recurrenceRule,
        projectId,
        stageId: projectId ? refs.stageId : null,
        source,
        externalTaskId: task.externalId,
        externalListId: task.projectExternalId,
        externalUpdatedAt: task.sourceUpdatedAt,
        lastSyncedAt: syncedAt(),
      };
      const tags = refs.tagIds.length
        ? { connect: refs.tagIds.map((id) => ({ id })) }
        : undefined;

      if (existingId) {
        const owned = await prisma.task.findFirst({
          where: { id: existingId, userId, workspaceId },
          select: { id: true },
        });
        if (owned) {
          // Tags are only added: a tag the person put on locally stays.
          await prisma.task.update({
            where: { id: existingId },
            data: { ...data, ...(tags ? { tags } : {}) },
          });
          return { id: existingId };
        }
      }
      return prisma.task.create({
        data: {
          ...data,
          userId,
          workspaceId,
          assigneeId: userId,
          status: TaskStatus.TODO,
          // Imported work is not auto-scheduled: a few hundred Todoist tasks
          // must not land on the calendar unasked (or spend a Free plan's
          // monthly auto-schedule allowance).
          isAutoScheduled: false,
          autoScheduled: false,
          ...(tags ? { tags } : {}),
          activities: {
            create: { workspaceId, actorId: userId, action: "CREATED" },
          },
        },
        select: { id: true },
      });
    },

    async writePart(existingId, part, taskId) {
      if (existingId) {
        const updated = await prisma.taskPart.updateMany({
          where: { id: existingId, taskId, task: { userId, workspaceId } },
          data: { title: part.title, position: part.position },
        });
        if (updated.count === 1) return { id: existingId };
      }
      return prisma.taskPart.create({
        data: { taskId, title: part.title, position: part.position },
        select: { id: true },
      });
    },
  };
}

/**
 * Plan limits for imported rows. PLAN_LIMITS (src/lib/plan-limits.ts) caps
 * calendars, boards, mailboxes, booking pages, habits, reminders per task and
 * auto-scheduled tasks; it caps none of the things a Todoist import creates
 * (projects, stages, tags, tasks, parts), and imported tasks are created
 * without auto-scheduling, so manual creation would allow every row here
 * too. When a limit on one of these entity types is added, it is enforced
 * here, by entity type, through the same entitlement helper.
 * //todo: map a new PLAN_LIMITS key to its ImportEntityType when one exists.
 */
export function createPlanLimitGuard(): ImportLimitGuard {
  return {
    async allowCreate() {
      return { allowed: true };
    },
  };
}
