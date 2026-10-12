import type { ImportEntityType } from "@prisma/client";

import {
  ImportCancelledError,
  type ImportCounts,
  type ImportLimitGuard,
  type ImportPlan,
  type ImportProgressHooks,
  type ImportStore,
  type ImportWarning,
  type ImportWriteResult,
  MAX_IMPORT_WARNINGS,
} from "./types";

const PROGRESS_EVERY = 25;

export function addWarning(warnings: ImportWarning[], warning: ImportWarning) {
  if (warnings.length < MAX_IMPORT_WARNINGS) {
    warnings.push(warning);
  } else if (warnings.length === MAX_IMPORT_WARNINGS) {
    warnings.push({
      code: "warnings_truncated",
      message: `More than ${MAX_IMPORT_WARNINGS} warnings; the rest were not kept.`,
    });
  }
}

/**
 * Writes a plan. Each object is mapped through ImportItemMap: a mapped row
 * is updated in place, an unmapped one is created (after the limit guard
 * agrees) and mapped. One object failing is counted and warned about; it
 * never stops the rest of the run.
 */
export async function applyImportPlan(
  plan: ImportPlan,
  store: ImportStore,
  guard: ImportLimitGuard,
  hooks: ImportProgressHooks = {}
): Promise<{ counts: ImportCounts; warnings: ImportWarning[] }> {
  const warnings: ImportWarning[] = [];
  for (const w of plan.warnings) addWarning(warnings, w);

  const counts: ImportCounts = {
    total:
      plan.projects.length +
      plan.stages.length +
      plan.tags.length +
      plan.tasks.length +
      plan.parts.length +
      plan.skipped,
    done: 0,
    skipped: plan.skipped,
    failed: 0,
  };
  let sinceProgress = 0;

  async function tick() {
    sinceProgress += 1;
    if (sinceProgress < PROGRESS_EVERY) return;
    sinceProgress = 0;
    if (hooks.isCancelled && (await hooks.isCancelled())) {
      throw new ImportCancelledError();
    }
    await hooks.onProgress?.({ ...counts }, warnings);
  }

  /** Map-or-create one object; returns its local id or null when not written. */
  async function upsert(
    entityType: ImportEntityType,
    externalId: string,
    sourceUpdatedAt: Date | null,
    write: (existingId: string | null) => Promise<ImportWriteResult>
  ): Promise<string | null> {
    try {
      const existingId = await store.findMappedId(entityType, externalId);
      if (!existingId) {
        const limit = await guard.allowCreate(entityType);
        if (!limit.allowed) {
          counts.skipped += 1;
          addWarning(warnings, {
            code: "plan_limit",
            message: limit.reason,
            externalId,
          });
          return null;
        }
      }
      const { id } = await write(existingId);
      await store.saveMapping(entityType, externalId, id, sourceUpdatedAt);
      counts.done += 1;
      return id;
    } catch (error) {
      if (error instanceof ImportCancelledError) throw error;
      counts.failed += 1;
      addWarning(warnings, {
        code: "write_failed",
        message: `Could not save this ${entityType}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        externalId,
      });
      return null;
    } finally {
      await tick();
    }
  }

  const projectIds = new Map<string, string>();
  for (const project of plan.projects) {
    const id = await upsert(
      "project",
      project.externalId,
      project.sourceUpdatedAt,
      (existingId) => store.writeProject(existingId, project)
    );
    if (id) projectIds.set(project.externalId, id);
  }

  const stageIds = new Map<string, string>();
  for (const stage of plan.stages) {
    const projectId = projectIds.get(stage.projectExternalId);
    if (!projectId) {
      counts.skipped += 1;
      addWarning(warnings, {
        code: "parent_missing",
        message: `Section "${stage.name}" was skipped because its project was not imported.`,
        externalId: stage.externalId,
      });
      await tick();
      continue;
    }
    const id = await upsert(
      "stage",
      stage.externalId,
      stage.sourceUpdatedAt,
      (existingId) => store.writeStage(existingId, stage, projectId)
    );
    if (id) stageIds.set(stage.externalId, id);
  }

  const tagIds = new Map<string, string>();
  for (const tag of plan.tags) {
    const id = await upsert("tag", tag.externalId, null, async () =>
      store.ensureTag(tag)
    );
    if (id) tagIds.set(tag.name, id);
  }

  const taskIds = new Map<string, string>();
  for (const task of plan.tasks) {
    const projectId = task.projectExternalId
      ? (projectIds.get(task.projectExternalId) ?? null)
      : null;
    if (task.projectExternalId && !projectId) {
      addWarning(warnings, {
        code: "parent_missing",
        message: `"${task.title}" went to the Inbox because its project was not imported.`,
        externalId: task.externalId,
      });
    }
    const stageId =
      projectId && task.stageExternalId
        ? (stageIds.get(task.stageExternalId) ?? null)
        : null;
    const refs = {
      projectId,
      stageId,
      tagIds: task.tagNames
        .map((name) => tagIds.get(name))
        .filter((id): id is string => Boolean(id)),
    };
    const id = await upsert(
      "task",
      task.externalId,
      task.sourceUpdatedAt,
      (existingId) => store.writeTask(existingId, task, refs)
    );
    if (id) taskIds.set(task.externalId, id);
  }

  for (const part of plan.parts) {
    const taskId = taskIds.get(part.taskExternalId);
    if (!taskId) {
      counts.skipped += 1;
      addWarning(warnings, {
        code: "parent_missing",
        message: `Sub-task "${part.title}" was skipped because its task was not imported.`,
        externalId: part.externalId,
      });
      await tick();
      continue;
    }
    await upsert("part", part.externalId, part.sourceUpdatedAt, (existingId) =>
      store.writePart(existingId, part, taskId)
    );
  }

  await hooks.onProgress?.({ ...counts }, warnings);
  return { counts, warnings };
}
