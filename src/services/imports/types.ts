import type { ImportEntityType, SchedulingTaskPriority } from "@prisma/client";

/**
 * The import framework, source-agnostic. A source turns what it fetched into
 * an ImportPlan (pure, testable without a database); `applyImportPlan` writes
 * the plan through an ImportStore, using ImportItemMap so a second run
 * updates the rows the first one made instead of duplicating them.
 */

export interface ImportCounts {
  total: number;
  done: number;
  skipped: number;
  failed: number;
}

export interface ImportWarning {
  code: string;
  message: string;
  externalId?: string;
}

/** Warnings beyond this are summarised, so one run cannot bloat its row. */
export const MAX_IMPORT_WARNINGS = 200;

export function emptyCounts(): ImportCounts {
  return { total: 0, done: 0, skipped: 0, failed: 0 };
}

export interface PlannedProject {
  externalId: string;
  name: string;
  description: string | null;
  position: number;
  sourceUpdatedAt: Date | null;
}

export interface PlannedStage {
  externalId: string;
  projectExternalId: string;
  name: string;
  position: number;
  sourceUpdatedAt: Date | null;
}

export interface PlannedTag {
  externalId: string;
  name: string;
}

export interface PlannedTask {
  externalId: string;
  title: string;
  description: string | null;
  projectExternalId: string | null;
  stageExternalId: string | null;
  dueDate: Date | null;
  deadline: Date | null;
  estimatedMinutes: number | null;
  priorityLevel: SchedulingTaskPriority;
  recurrenceRule: string | null;
  tagNames: string[];
  sourceUpdatedAt: Date | null;
}

export interface PlannedPart {
  externalId: string;
  taskExternalId: string;
  title: string;
  position: number;
  sourceUpdatedAt: Date | null;
}

export interface ImportPlan {
  projects: PlannedProject[];
  stages: PlannedStage[];
  tags: PlannedTag[];
  tasks: PlannedTask[];
  parts: PlannedPart[];
  /** Objects the source has that the plan deliberately leaves out. */
  skipped: number;
  warnings: ImportWarning[];
}

export type ImportWriteResult = { id: string };

/** Database seam for `applyImportPlan`; Prisma in production. */
export interface ImportStore {
  findMappedId(
    entityType: ImportEntityType,
    externalId: string
  ): Promise<string | null>;
  saveMapping(
    entityType: ImportEntityType,
    externalId: string,
    localId: string,
    sourceUpdatedAt: Date | null
  ): Promise<void>;
  writeProject(
    existingId: string | null,
    project: PlannedProject
  ): Promise<ImportWriteResult>;
  writeStage(
    existingId: string | null,
    stage: PlannedStage,
    projectId: string
  ): Promise<ImportWriteResult>;
  ensureTag(tag: PlannedTag): Promise<ImportWriteResult>;
  writeTask(
    existingId: string | null,
    task: PlannedTask,
    refs: { projectId: string | null; stageId: string | null; tagIds: string[] }
  ): Promise<ImportWriteResult>;
  writePart(
    existingId: string | null,
    part: PlannedPart,
    taskId: string
  ): Promise<ImportWriteResult>;
}

/**
 * Plan limits, asked once per new row. An import must respect the same limits
 * manual creation does; a refusal is a skipped row with a warning.
 */
export interface ImportLimitGuard {
  allowCreate(
    entityType: ImportEntityType
  ): Promise<{ allowed: true } | { allowed: false; reason: string }>;
}

export interface ImportProgressHooks {
  onProgress?: (
    counts: ImportCounts,
    warnings: ImportWarning[]
  ) => Promise<void>;
  isCancelled?: () => Promise<boolean>;
  /**
   * Called from the long stretches that do not tick progress (paging
   * discovery, building the tree, downloading a file). The runner throttles
   * it to one `updatedAt` write a minute.
   */
  onHeartbeat?: () => Promise<void>;
}

export class ImportCancelledError extends Error {
  constructor() {
    super("Import cancelled");
    this.name = "ImportCancelledError";
  }
}
