import type { ImportEntityType } from "@prisma/client";

import type {
  ImportStore,
  PlannedPart,
  PlannedProject,
  PlannedStage,
  PlannedTask,
} from "../types";

type Scoped<T> = T & { workspaceId: string };

/**
 * An in-memory database of one user's rows, and ImportStores over it that
 * keep the same contract as the Prisma store: a mapped row outside the
 * store's workspace counts as missing, so a fresh row is made there.
 */
export function createMemoryDb() {
  let seq = 0;
  const nextId = (prefix: string) => `${prefix}_${++seq}`;
  const maps = new Map<string, string>();
  const projects = new Map<string, Scoped<PlannedProject>>();
  const stages = new Map<
    string,
    Scoped<PlannedStage & { projectId: string }>
  >();
  const tags = new Map<string, string>(); // name -> id (tags are per user)
  const tasks = new Map<
    string,
    Scoped<
      PlannedTask & {
        projectId: string | null;
        stageId: string | null;
        tagIds: string[];
      }
    >
  >();
  const parts = new Map<string, PlannedPart & { taskId: string }>();
  const key = (t: ImportEntityType, id: string) => `${t}:${id}`;

  function storeFor(workspaceId: string): ImportStore {
    const inWs = <T extends { workspaceId: string }>(
      table: Map<string, T>,
      id: string | null
    ): id is string => !!id && table.get(id)?.workspaceId === workspaceId;

    return {
      async findMappedId(entityType, externalId) {
        return maps.get(key(entityType, externalId)) ?? null;
      },
      async saveMapping(entityType, externalId, localId) {
        maps.set(key(entityType, externalId), localId);
      },
      async writeProject(existingId, project) {
        const id = inWs(projects, existingId) ? existingId : nextId("project");
        projects.set(id, { ...project, workspaceId });
        return { id };
      },
      async writeStage(existingId, stage, projectId) {
        const id = inWs(stages, existingId) ? existingId : nextId("stage");
        stages.set(id, { ...stage, projectId, workspaceId });
        return { id };
      },
      async ensureTag(tag) {
        const id = tags.get(tag.name) ?? nextId("tag");
        tags.set(tag.name, id);
        return { id };
      },
      async writeTask(existingId, task, refs) {
        const id = inWs(tasks, existingId) ? existingId : nextId("task");
        const projectId = inWs(projects, refs.projectId)
          ? refs.projectId
          : null;
        const prior = tasks.get(id);
        tasks.set(id, {
          ...task,
          projectId,
          stageId: projectId ? refs.stageId : null,
          workspaceId,
          tagIds: [...new Set([...(prior?.tagIds ?? []), ...refs.tagIds])],
        });
        return { id };
      },
      async writePart(existingId, part, taskId) {
        const owner = existingId ? parts.get(existingId)?.taskId : undefined;
        const id =
          existingId && owner && inWs(tasks, owner)
            ? existingId
            : nextId("part");
        parts.set(id, { ...part, taskId });
        return { id };
      },
    };
  }

  return { storeFor, maps, projects, stages, tags, tasks, parts };
}

/** One workspace's store plus the tables, for single-workspace tests. */
export function createMemoryStore(workspaceId = "ws-1") {
  const db = createMemoryDb();
  return { ...db, store: db.storeFor(workspaceId) };
}
