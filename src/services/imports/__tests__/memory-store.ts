import type { PageBlockInput } from "@/services/pages/page-write-path";
import type { ImportEntityType } from "@prisma/client";

import type {
  NotionEntityType,
  NotionImportStore,
  NotionMapping,
  PageWrite,
  PlannedDatabaseProperty,
  StoredValue,
} from "../notion/types";
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

  /* ----- Notion tables ----- */
  interface MemPage extends PageWrite {
    workspaceId: string;
    isPrivate: boolean;
    coverUrl: string | null;
    blocks: PageBlockInput[];
    writes: number;
  }
  const pages = new Map<string, MemPage>();
  const notionMaps = new Map<string, NotionMapping>();
  const databases = new Map<
    string,
    {
      pageId: string;
      properties: Map<string, PlannedDatabaseProperty & { id: string }>;
    }
  >();
  const records = new Map<
    string,
    {
      pageId: string;
      databaseId: string;
      position: number;
      values: Map<string, StoredValue>;
    }
  >();
  const assets = new Map<
    string,
    { pageId: string; name: string; mimeType: string; bytes: Buffer }
  >();

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

  /**
   * The Notion importer's store over the in-memory tables, with the Prisma
   * store's contract: anything outside this workspace counts as missing.
   */
  function notionStoreFor(workspaceId: string): NotionImportStore {
    const pageHere = (id: string | null): id is string =>
      !!id && pages.get(id)?.workspaceId === workspaceId;
    return {
      async findMapped(entityType: NotionEntityType, externalId) {
        const row = notionMaps.get(key(entityType, externalId));
        if (!row) return null;
        const live =
          entityType === "asset"
            ? pageHere(assets.get(row.localId)?.pageId ?? null)
            : pageHere(row.localId);
        return live ? row : null;
      },
      async saveMapping(entityType, externalId, localId, sourceUpdatedAt) {
        notionMaps.set(key(entityType, externalId), {
          localId,
          sourceUpdatedAt,
        });
      },
      async writePage(existingId, page) {
        const parentId = pageHere(page.parentId) ? page.parentId : null;
        if (pageHere(existingId)) {
          const prior = pages.get(existingId) as MemPage;
          pages.set(existingId, {
            ...prior,
            ...page,
            parentId,
            writes: prior.writes + 1,
          });
          return { id: existingId };
        }
        const id = nextId("page");
        pages.set(id, {
          ...page,
          parentId,
          workspaceId,
          isPrivate: true,
          coverUrl: null,
          blocks: [],
          writes: 1,
        });
        return { id };
      },
      async setCover(pageId, coverUrl) {
        if (pageHere(pageId))
          (pages.get(pageId) as MemPage).coverUrl = coverUrl;
      },
      async writeDatabase(pageId, properties) {
        if (!pageHere(pageId)) throw new Error("not in workspace");
        let entry = [...databases.entries()].find(
          ([, d]) => d.pageId === pageId
        );
        if (!entry) {
          const id = nextId("database");
          entry = [id, { pageId, properties: new Map() }];
          databases.set(id, entry[1]);
        }
        const [databaseId, database] = entry;
        const propertyIds = new Map<string, string>();
        for (const property of properties) {
          const known = database.properties.get(property.name);
          const id = known?.id ?? nextId("property");
          database.properties.set(property.name, { ...property, id });
          propertyIds.set(property.name, id);
        }
        return { databaseId, propertyIds };
      },
      async writeRecord(pageId, databaseId, position, values, managed) {
        if (!pageHere(pageId) || !databases.has(databaseId)) {
          throw new Error("not in workspace");
        }
        const prior = records.get(pageId);
        const merged = new Map(prior?.values ?? []);
        for (const id of managed) if (!values.has(id)) merged.delete(id);
        for (const [id, value] of values) merged.set(id, value);
        records.set(pageId, { pageId, databaseId, position, values: merged });
      },
      async writeBlocks(pageId, blocks) {
        if (!pageHere(pageId)) throw new Error("not in workspace");
        (pages.get(pageId) as MemPage).blocks = blocks;
      },
      async saveAsset(pageId, asset) {
        if (!pageHere(pageId)) throw new Error("not in workspace");
        const id = nextId("asset");
        assets.set(id, { pageId, ...asset });
        return { id, url: `/api/pages/${pageId}/assets/${id}` };
      },
      async assetUrl(pageId, assetId) {
        return assets.get(assetId)?.pageId === pageId && pageHere(pageId)
          ? `/api/pages/${pageId}/assets/${assetId}`
          : null;
      },
    };
  }

  return {
    storeFor,
    notionStoreFor,
    maps,
    projects,
    stages,
    tags,
    tasks,
    parts,
    pages,
    notionMaps,
    databases,
    records,
    assets,
  };
}

/** One workspace's store plus the tables, for single-workspace tests. */
export function createMemoryStore(workspaceId = "ws-1") {
  const db = createMemoryDb();
  return { ...db, store: db.storeFor(workspaceId) };
}
