import type { ImportEntityType } from "@prisma/client";

import type {
  ImportStore,
  PlannedPart,
  PlannedProject,
  PlannedStage,
  PlannedTask,
} from "../types";

/** An in-memory ImportStore: the same contract the Prisma store keeps. */
export function createMemoryStore() {
  let seq = 0;
  const nextId = (prefix: string) => `${prefix}_${++seq}`;
  const maps = new Map<string, string>();
  const projects = new Map<string, PlannedProject>();
  const stages = new Map<string, PlannedStage & { projectId: string }>();
  const tags = new Map<string, string>(); // name -> id
  const tasks = new Map<
    string,
    PlannedTask & {
      projectId: string | null;
      stageId: string | null;
      tagIds: string[];
    }
  >();
  const parts = new Map<string, PlannedPart & { taskId: string }>();
  const key = (t: ImportEntityType, id: string) => `${t}:${id}`;

  const store: ImportStore = {
    async findMappedId(entityType, externalId) {
      return maps.get(key(entityType, externalId)) ?? null;
    },
    async saveMapping(entityType, externalId, localId) {
      maps.set(key(entityType, externalId), localId);
    },
    async writeProject(existingId, project) {
      const id =
        existingId && projects.has(existingId) ? existingId : nextId("project");
      projects.set(id, project);
      return { id };
    },
    async writeStage(existingId, stage, projectId) {
      const id =
        existingId && stages.has(existingId) ? existingId : nextId("stage");
      stages.set(id, { ...stage, projectId });
      return { id };
    },
    async ensureTag(tag) {
      const id = tags.get(tag.name) ?? nextId("tag");
      tags.set(tag.name, id);
      return { id };
    },
    async writeTask(existingId, task, refs) {
      const id =
        existingId && tasks.has(existingId) ? existingId : nextId("task");
      const prior = tasks.get(id);
      tasks.set(id, {
        ...task,
        ...refs,
        tagIds: [...new Set([...(prior?.tagIds ?? []), ...refs.tagIds])],
      });
      return { id };
    },
    async writePart(existingId, part, taskId) {
      const id =
        existingId && parts.has(existingId) ? existingId : nextId("part");
      parts.set(id, { ...part, taskId });
      return { id };
    },
  };

  return { store, maps, projects, stages, tags, tasks, parts };
}
