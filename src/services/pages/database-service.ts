import type { PageActor } from "@/services/pages/page-service";
import {
  DatabasePropertyType,
  DatabaseViewType,
  PageAccessRole,
  Prisma,
} from "@prisma/client";

import { pageVisibilityWhere, resolvePageAccess } from "@/lib/auth/page-auth";
import { prisma } from "@/lib/prisma";

import { evaluateFormula } from "./formula";

async function ownedDatabase(
  actor: PageActor,
  databaseId: string,
  requiredRole: PageAccessRole
) {
  const database = await prisma.pageDatabase.findFirst({
    where: {
      id: databaseId,
      page: {
        ...(typeof actor === "string"
          ? { userId: actor }
          : pageVisibilityWhere(actor)),
        trashedAt: null,
      },
    },
    include: {
      page: true,
      properties: { orderBy: { position: "asc" } },
      views: { orderBy: { position: "asc" } },
      records: {
        orderBy: { position: "asc" },
        include: { page: true, values: true },
      },
    },
  });
  if (
    database &&
    typeof actor !== "string" &&
    !(await resolvePageAccess(actor, database.pageId, requiredRole))
  ) {
    return null;
  }
  return database;
}

export async function getDatabase(actor: PageActor, databaseId: string) {
  return ownedDatabase(actor, databaseId, PageAccessRole.VIEWER);
}

export async function createDatabaseProperty(
  actor: PageActor,
  databaseId: string,
  input: {
    name: string;
    type: DatabasePropertyType;
    config?: Prisma.InputJsonValue;
  }
) {
  const database = await ownedDatabase(
    actor,
    databaseId,
    PageAccessRole.EDITOR
  );
  if (!database) return null;
  return prisma.databaseProperty.create({
    data: {
      databaseId,
      name: input.name.trim().slice(0, 120) || "Property",
      type: input.type,
      config: input.config,
      position: (database.properties.at(-1)?.position ?? 0) + 1024,
    },
  });
}

export async function createDatabaseView(
  actor: PageActor,
  databaseId: string,
  input: { name: string; type: DatabaseViewType }
) {
  const database = await ownedDatabase(
    actor,
    databaseId,
    PageAccessRole.EDITOR
  );
  if (!database) return null;
  return prisma.databaseView.create({
    data: {
      databaseId,
      name: input.name.trim().slice(0, 120) || input.type.toLowerCase(),
      type: input.type,
      position: (database.views.at(-1)?.position ?? 0) + 1024,
    },
  });
}

export async function createDatabaseRecord(
  actor: PageActor,
  databaseId: string,
  input: { title?: string; values?: Record<string, Prisma.InputJsonValue> }
) {
  const database = await ownedDatabase(
    actor,
    databaseId,
    PageAccessRole.EDITOR
  );
  if (!database) return null;
  const userId = typeof actor === "string" ? actor : actor.userId;
  const validPropertyIds = new Set(
    database.properties.map((property) => property.id)
  );
  return prisma.$transaction(async (tx) => {
    const page = await tx.page.create({
      data: {
        userId,
        workspaceId: database.page.workspaceId,
        parentId: database.pageId,
        title: input.title?.trim().slice(0, 240) || "Untitled",
        isPrivate: database.page.isPrivate,
        position: (database.records.at(-1)?.position ?? 0) + 1024,
        blocks: {
          create: { type: "PARAGRAPH", content: { text: "" }, position: 1024 },
        },
      },
    });
    return tx.databaseRecord.create({
      data: {
        databaseId,
        pageId: page.id,
        position: page.position,
        values: {
          create: Object.entries(input.values ?? {})
            .filter(([propertyId]) => validPropertyIds.has(propertyId))
            .map(([propertyId, value]) => ({ propertyId, value })),
        },
      },
      include: { page: true, values: true },
    });
  });
}

export async function updateDatabaseRecord(
  actor: PageActor,
  recordId: string,
  input: { title?: string; values?: Record<string, Prisma.InputJsonValue> }
) {
  const record = await prisma.databaseRecord.findFirst({
    where: {
      id: recordId,
      database: {
        page: {
          ...(typeof actor === "string"
            ? { userId: actor }
            : pageVisibilityWhere(actor)),
          trashedAt: null,
        },
      },
    },
    include: {
      database: { include: { page: true, properties: true } },
    },
  });
  if (!record) return null;
  if (
    typeof actor !== "string" &&
    !(await resolvePageAccess(
      actor,
      record.database.pageId,
      PageAccessRole.EDITOR
    ))
  ) {
    return null;
  }
  const validPropertyIds = new Set(
    record.database.properties.map((property) => property.id)
  );
  return prisma.$transaction(async (tx) => {
    if (input.title !== undefined) {
      await tx.page.update({
        where: { id: record.pageId },
        data: { title: input.title.trim().slice(0, 240) || "Untitled" },
      });
    }
    for (const [propertyId, value] of Object.entries(input.values ?? {})) {
      if (!validPropertyIds.has(propertyId)) continue;
      await tx.databaseValue.upsert({
        where: { recordId_propertyId: { recordId, propertyId } },
        create: { recordId, propertyId, value },
        update: { value },
      });
    }
    return tx.databaseRecord.findUnique({
      where: { id: recordId },
      include: { page: true, values: true },
    });
  });
}

export async function deleteDatabaseRecord(actor: PageActor, recordId: string) {
  const record = await prisma.databaseRecord.findFirst({
    where: {
      id: recordId,
      database: {
        page: {
          ...(typeof actor === "string"
            ? { userId: actor }
            : pageVisibilityWhere(actor)),
          trashedAt: null,
        },
      },
    },
    select: { pageId: true, database: { select: { pageId: true } } },
  });
  if (!record) return false;
  if (
    typeof actor !== "string" &&
    !(await resolvePageAccess(
      actor,
      record.database.pageId,
      PageAccessRole.EDITOR
    ))
  ) {
    return false;
  }
  await prisma.page.delete({ where: { id: record.pageId } });
  return true;
}

/** Dates sort by their ISO text; String(Date) would sort by weekday name. */
function sortText(value: unknown) {
  return value instanceof Date ? value.toISOString() : String(value ?? "");
}

interface QueryFilter {
  propertyId: string;
  operator: "equals" | "contains" | "is_empty";
  value?: unknown;
}

interface QuerySort {
  propertyId?: string;
  field?: "title" | "updatedAt";
  direction: "asc" | "desc";
}

export async function queryDatabase(
  actor: PageActor,
  databaseId: string,
  input: { filters?: QueryFilter[]; sort?: QuerySort[] }
) {
  const database = await ownedDatabase(
    actor,
    databaseId,
    PageAccessRole.VIEWER
  );
  if (!database) return null;
  const propertyById = new Map(
    database.properties.map((property) => [property.id, property])
  );
  const projected = database.records
    .filter((record) => !record.page.trashedAt)
    .map((record) => {
      const values = Object.fromEntries(
        record.values.map((entry) => [entry.propertyId, entry.value])
      );
      const byName = Object.fromEntries(
        database.properties.map((property) => [
          property.name,
          values[property.id] as string | number | boolean | null,
        ])
      );
      for (const property of database.properties) {
        if (property.type !== DatabasePropertyType.FORMULA) continue;
        const expression =
          property.config &&
          typeof property.config === "object" &&
          !Array.isArray(property.config)
            ? (property.config as Prisma.JsonObject).expression
            : undefined;
        if (typeof expression === "string") {
          try {
            values[property.id] = evaluateFormula(expression, byName);
          } catch {
            values[property.id] = null;
          }
        }
      }
      return { ...record, values };
    });

  const filtered = projected.filter((record) =>
    (input.filters ?? []).every((filter) => {
      if (!propertyById.has(filter.propertyId)) return true;
      const value = record.values[filter.propertyId];
      if (filter.operator === "is_empty")
        return value === null || value === undefined || value === "";
      if (filter.operator === "contains")
        return String(value ?? "")
          .toLowerCase()
          .includes(String(filter.value ?? "").toLowerCase());
      return (
        JSON.stringify(value ?? null) === JSON.stringify(filter.value ?? null)
      );
    })
  );

  return filtered.sort((left, right) => {
    for (const sort of input.sort ?? []) {
      const leftValue = sort.field
        ? left.page[sort.field]
        : sort.propertyId
          ? left.values[sort.propertyId]
          : null;
      const rightValue = sort.field
        ? right.page[sort.field]
        : sort.propertyId
          ? right.values[sort.propertyId]
          : null;
      const comparison = sortText(leftValue).localeCompare(
        sortText(rightValue),
        undefined,
        { numeric: true }
      );
      if (comparison !== 0)
        return sort.direction === "desc" ? -comparison : comparison;
    }
    return left.position - right.position;
  });
}
