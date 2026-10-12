import { writePageBlocks } from "@/services/pages/page-write-path";
import { PageAuthor, PageBlockType } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import type { NotionImportStore } from "./types";

/**
 * The Prisma side of the Notion import. Like the Todoist store, every read
 * and write is scoped to the run's user and workspace: a mapped id outside
 * them counts as missing, a fresh row is created in the run's workspace and
 * the mapping is pointed at it. Imported pages are private to their owner
 * (isPrivate), so importing into a shared workspace shares nothing until the
 * person chooses to.
 */
export function createPrismaNotionStore(input: {
  userId: string;
  workspaceId: string;
  importRunId: string;
}): NotionImportStore {
  const { userId, workspaceId, importRunId } = input;
  const source = "notion" as const;
  const scope = { userId, workspaceId } as const;

  const key = (
    entityType: Parameters<NotionImportStore["findMapped"]>[0],
    externalId: string
  ) => ({
    userId_source_externalId_entityType: {
      userId,
      source,
      externalId,
      entityType,
    },
  });

  async function pageInScope(pageId: string) {
    const found = await prisma.page.findFirst({
      where: { id: pageId, ...scope },
      select: { id: true },
    });
    return Boolean(found);
  }

  return {
    async findMapped(entityType, externalId) {
      const row = await prisma.importItemMap.findUnique({
        where: key(entityType, externalId),
        select: { localId: true, sourceUpdatedAt: true },
      });
      if (!row) return null;
      const live =
        entityType === "asset"
          ? await prisma.pageAsset.findFirst({
              where: { id: row.localId, page: scope },
              select: { id: true },
            })
          : await prisma.page.findFirst({
              where: { id: row.localId, ...scope },
              select: { id: true },
            });
      return live
        ? { localId: row.localId, sourceUpdatedAt: row.sourceUpdatedAt }
        : null;
    },

    async saveMapping(entityType, externalId, localId, sourceUpdatedAt) {
      await prisma.importItemMap.upsert({
        where: key(entityType, externalId),
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

    async writePage(existingId, page) {
      const parentId =
        page.parentId &&
        page.parentId !== existingId &&
        (await pageInScope(page.parentId))
          ? page.parentId
          : null;
      const data = {
        title: page.title.trim().slice(0, 240) || "Untitled",
        icon: page.icon?.slice(0, 32) || null,
        parentId,
        position: page.position,
      };
      if (existingId) {
        const updated = await prisma.page.updateMany({
          where: { id: existingId, ...scope },
          data,
        });
        if (updated.count === 1) return { id: existingId };
      }
      return prisma.page.create({
        data: {
          ...data,
          ...scope,
          isPrivate: true,
          blocks: {
            create: {
              type: PageBlockType.PARAGRAPH,
              content: { text: "" },
              position: 1024,
            },
          },
        },
        select: { id: true },
      });
    },

    async setCover(pageId, coverUrl) {
      await prisma.page.updateMany({
        where: { id: pageId, ...scope },
        data: { coverUrl },
      });
    },

    async writeDatabase(pageId, properties) {
      if (!(await pageInScope(pageId))) {
        throw new Error("The database page is not in this workspace");
      }
      const database =
        (await prisma.pageDatabase.findUnique({ where: { pageId } })) ??
        (await prisma.pageDatabase.create({
          data: {
            pageId,
            views: {
              create: { name: "Table", type: "TABLE", position: 1024 },
            },
          },
        }));
      const existing = await prisma.databaseProperty.findMany({
        where: { databaseId: database.id },
        select: { id: true, name: true },
      });
      const byName = new Map(existing.map((p) => [p.name, p.id]));
      const propertyIds = new Map<string, string>();
      let position = 0;
      for (const property of properties) {
        position += 1024;
        const known = byName.get(property.name);
        if (known) {
          await prisma.databaseProperty.update({
            where: { id: known },
            data: { config: property.config ?? undefined },
          });
          propertyIds.set(property.name, known);
        } else {
          const created = await prisma.databaseProperty.create({
            data: {
              databaseId: database.id,
              name: property.name,
              type: property.type,
              config: property.config ?? undefined,
              position,
            },
            select: { id: true },
          });
          propertyIds.set(property.name, created.id);
        }
      }
      return { databaseId: database.id, propertyIds };
    },

    async writeRecord(
      pageId,
      databaseId,
      position,
      values,
      managedPropertyIds
    ) {
      const [database, rowInScope] = await Promise.all([
        prisma.pageDatabase.findFirst({
          where: { id: databaseId, page: scope },
          select: { id: true, properties: { select: { id: true } } },
        }),
        pageInScope(pageId),
      ]);
      if (!database || !rowInScope) {
        throw new Error("The row or its database is not in this workspace");
      }
      const record = await prisma.databaseRecord.upsert({
        where: { pageId },
        create: { databaseId, pageId, position },
        update: { position },
        select: { id: true },
      });
      const valid = new Set(database.properties.map((p) => p.id));
      for (const [propertyId, value] of values) {
        if (!valid.has(propertyId)) continue;
        await prisma.databaseValue.upsert({
          where: { recordId_propertyId: { recordId: record.id, propertyId } },
          create: { recordId: record.id, propertyId, value },
          update: { value },
        });
      }
      const cleared = managedPropertyIds.filter(
        (id) => valid.has(id) && !values.has(id)
      );
      if (cleared.length) {
        await prisma.databaseValue.deleteMany({
          where: { recordId: record.id, propertyId: { in: cleared } },
        });
      }
    },

    async writeBlocks(pageId, blocks) {
      const written = await writePageBlocks(
        userId,
        pageId,
        blocks,
        PageAuthor.HUMAN,
        1
      );
      if (!written) throw new Error("The page could not be written");
    },

    async saveAsset(pageId, asset) {
      if (!(await pageInScope(pageId))) {
        throw new Error("The page is not in this workspace");
      }
      const created = await prisma.pageAsset.create({
        data: {
          pageId,
          userId,
          originalName: asset.name.slice(0, 240) || "attachment",
          mimeType: asset.mimeType.slice(0, 120) || "application/octet-stream",
          size: asset.bytes.byteLength,
          bytes: asset.bytes,
        },
        select: { id: true },
      });
      return {
        id: created.id,
        url: `/api/pages/${pageId}/assets/${created.id}`,
      };
    },

    async assetUrl(pageId, assetId) {
      const found = await prisma.pageAsset.findFirst({
        where: { id: assetId, pageId, page: scope },
        select: { id: true },
      });
      return found ? `/api/pages/${pageId}/assets/${found.id}` : null;
    },
  };
}
