import { prisma } from "@/lib/prisma";

import { createPrismaNotionStore } from "../notion/prisma-store";

/*
 * The Prisma store over a small in-memory fake of the tables it touches. The
 * fake honours the `where` filters the store writes (equality, nested
 * relations), so a query that forgets userId / workspaceId finds what it
 * should not and these tests go red.
 */

jest.mock("@/lib/prisma", () => ({
  prisma: {
    page: { findFirst: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
    importItemMap: { findUnique: jest.fn(), upsert: jest.fn() },
    pageAsset: { findFirst: jest.fn(), create: jest.fn() },
    pageDatabase: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    databaseProperty: {
      findMany: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    databaseRecord: { upsert: jest.fn() },
    databaseValue: { upsert: jest.fn(), deleteMany: jest.fn() },
  },
}));
jest.mock("@/services/pages/page-write-path", () => ({
  writePageBlocks: jest.fn(),
}));

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
let seq = 0;

function matches(
  row: Row,
  where: Record<string, unknown> | undefined
): boolean {
  return Object.entries(where ?? {}).every(([key, expected]) => {
    const actual = row[key];
    if (
      expected &&
      typeof expected === "object" &&
      !(expected instanceof Date)
    ) {
      const e = expected as Record<string, unknown>;
      if ("in" in e) return (e.in as unknown[]).includes(actual);
      if (key === "page") {
        const page = tables.page.find((p) => p.id === row.pageId);
        return !!page && matches(page, e);
      }
      return false;
    }
    return actual === expected;
  });
}

function wire() {
  for (const name of [
    "page",
    "importItemMap",
    "pageAsset",
    "pageDatabase",
    "databaseProperty",
    "databaseRecord",
    "databaseValue",
  ]) {
    tables[name] = [];
  }
  const p = prisma as unknown as Record<string, Record<string, jest.Mock>>;
  p.page.findFirst.mockImplementation(
    async ({ where }) => tables.page.find((r) => matches(r, where)) ?? null
  );
  p.page.updateMany.mockImplementation(async ({ where, data }) => {
    const hit = tables.page.filter((r) => matches(r, where));
    hit.forEach((r) => Object.assign(r, data));
    return { count: hit.length };
  });
  p.page.create.mockImplementation(async ({ data }) => {
    const row = { id: `page-${++seq}`, ...data };
    tables.page.push(row);
    return { id: row.id };
  });
  p.importItemMap.findUnique.mockImplementation(async ({ where }) => {
    const k = where.userId_source_externalId_entityType;
    return (
      tables.importItemMap.find(
        (r) =>
          r.externalId === k.externalId &&
          r.entityType === k.entityType &&
          r.userId === k.userId
      ) ?? null
    );
  });
  p.importItemMap.upsert.mockImplementation(
    async ({ where, create, update }) => {
      const k = where.userId_source_externalId_entityType;
      const found = tables.importItemMap.find(
        (r) =>
          r.externalId === k.externalId &&
          r.entityType === k.entityType &&
          r.userId === k.userId
      );
      if (found) Object.assign(found, update);
      else tables.importItemMap.push({ ...create });
    }
  );
  p.pageAsset.findFirst.mockImplementation(
    async ({ where }) => tables.pageAsset.find((r) => matches(r, where)) ?? null
  );
  p.pageAsset.create.mockImplementation(async ({ data }) => {
    const row = { id: `asset-${++seq}`, ...data };
    tables.pageAsset.push(row);
    return { id: row.id };
  });
  p.pageDatabase.findUnique.mockImplementation(
    async ({ where }) =>
      tables.pageDatabase.find((r) => r.pageId === where.pageId) ?? null
  );
  p.pageDatabase.findFirst.mockImplementation(async ({ where }) => {
    const found = tables.pageDatabase.find((r) => matches(r, where));
    return found
      ? {
          ...found,
          properties: tables.databaseProperty
            .filter((x) => x.databaseId === found.id)
            .map((x) => ({ id: x.id })),
        }
      : null;
  });
  p.pageDatabase.create.mockImplementation(async ({ data }) => {
    const row = { id: `db-${++seq}`, pageId: data.pageId };
    tables.pageDatabase.push(row);
    return row;
  });
  p.databaseProperty.findMany.mockImplementation(async ({ where }) =>
    tables.databaseProperty.filter((r) => matches(r, where))
  );
  p.databaseProperty.update.mockResolvedValue({});
  p.databaseProperty.create.mockImplementation(async ({ data }) => {
    const row = { id: `prop-${++seq}`, ...data };
    tables.databaseProperty.push(row);
    return { id: row.id };
  });
  p.databaseRecord.upsert.mockImplementation(async ({ create }) => ({
    id: `rec-${create.pageId}`,
  }));
  p.databaseValue.upsert.mockResolvedValue({});
  p.databaseValue.deleteMany.mockResolvedValue({ count: 0 });
}

function seedPage(id: string, userId: string, workspaceId: string) {
  tables.page.push({ id, userId, workspaceId });
}

const store = (workspaceId: string, userId = "user-1") =>
  createPrismaNotionStore({ userId, workspaceId, importRunId: "run-1" });

describe("Prisma Notion store scoping", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    wire();
  });

  it("creates pages in the run's workspace, private, with a first empty paragraph", async () => {
    const { id } = await store("ws-1").writePage(null, {
      title: "Hello",
      icon: "🚀",
      parentId: null,
      position: 1024,
    });
    expect(tables.page.find((r) => r.id === id)).toMatchObject({
      userId: "user-1",
      workspaceId: "ws-1",
      isPrivate: true,
      title: "Hello",
      icon: "🚀",
    });
    expect(
      jest.mocked(prisma.page.create).mock.calls[0][0].data.blocks
    ).toEqual({
      create: { type: "PARAGRAPH", content: { text: "" }, position: 1024 },
    });
  });

  it("treats a mapping that points into another workspace, or at a deleted page, as missing", async () => {
    seedPage("elsewhere", "user-1", "ws-2");
    seedPage("here", "user-1", "ws-1");
    seedPage("someone-elses", "user-2", "ws-1");
    const s = store("ws-1");
    await s.saveMapping("page", "n1", "elsewhere", null);
    await s.saveMapping("page", "n2", "here", new Date("2026-10-01T00:00:00Z"));
    await s.saveMapping("page", "n3", "someone-elses", null);
    await s.saveMapping("page", "n4", "deleted", null);
    expect(await s.findMapped("page", "n1")).toBeNull();
    expect(await s.findMapped("page", "n3")).toBeNull();
    expect(await s.findMapped("page", "n4")).toBeNull();
    expect(await s.findMapped("page", "n2")).toEqual({
      localId: "here",
      sourceUpdatedAt: new Date("2026-10-01T00:00:00Z"),
    });
    expect(await s.findMapped("page", "never-seen")).toBeNull();
  });

  it("will not update a page of another workspace or user: it writes a fresh one instead", async () => {
    seedPage("elsewhere", "user-1", "ws-2");
    seedPage("theirs", "user-2", "ws-1");
    for (const target of ["elsewhere", "theirs"]) {
      const { id } = await store("ws-1").writePage(target, {
        title: "New title",
        icon: null,
        parentId: null,
        position: 1024,
      });
      expect(id).not.toBe(target);
      expect(tables.page.find((r) => r.id === target)).not.toHaveProperty(
        "title"
      );
      expect(tables.page.find((r) => r.id === id)).toMatchObject({
        workspaceId: "ws-1",
        userId: "user-1",
      });
    }
  });

  it("updates a page of its own in place", async () => {
    seedPage("mine", "user-1", "ws-1");
    const { id } = await store("ws-1").writePage("mine", {
      title: "Renamed",
      icon: null,
      parentId: null,
      position: 2048,
    });
    expect(id).toBe("mine");
    expect(tables.page.find((r) => r.id === "mine")).toMatchObject({
      title: "Renamed",
      position: 2048,
    });
  });

  it("never parents a page under one outside the workspace", async () => {
    seedPage("elsewhere", "user-1", "ws-2");
    seedPage("mine", "user-1", "ws-1");
    const a = await store("ws-1").writePage(null, {
      title: "A",
      icon: null,
      parentId: "elsewhere",
      position: 1,
    });
    const b = await store("ws-1").writePage(null, {
      title: "B",
      icon: null,
      parentId: "mine",
      position: 2,
    });
    expect(tables.page.find((r) => r.id === a.id)?.parentId).toBeNull();
    expect(tables.page.find((r) => r.id === b.id)?.parentId).toBe("mine");
  });

  it("refuses to make a database, a row or an asset on a page outside the workspace", async () => {
    seedPage("elsewhere", "user-1", "ws-2");
    seedPage("mine", "user-1", "ws-1");
    const s = store("ws-1");
    await expect(s.writeDatabase("elsewhere", [])).rejects.toThrow();
    await expect(
      s.saveAsset("elsewhere", {
        name: "a",
        mimeType: "x/y",
        bytes: Buffer.from("1"),
      })
    ).rejects.toThrow();
    const { databaseId } = await s.writeDatabase("mine", []);
    await expect(
      store("ws-2").writeRecord("mine", databaseId, 1024, new Map(), [])
    ).rejects.toThrow();
    expect(tables.pageAsset).toHaveLength(0);
  });

  it("scopes the cover and the asset lookup to the workspace", async () => {
    seedPage("elsewhere", "user-1", "ws-2");
    seedPage("mine", "user-1", "ws-1");
    await store("ws-1").setCover("elsewhere", "https://x/c.png");
    expect(tables.page.find((r) => r.id === "elsewhere")).not.toHaveProperty(
      "coverUrl"
    );
    const saved = await store("ws-1").saveAsset("mine", {
      name: "a.png",
      mimeType: "image/png",
      bytes: Buffer.from("12"),
    });
    expect(saved.url).toBe(`/api/pages/mine/assets/${saved.id}`);
    expect(await store("ws-1").assetUrl("mine", saved.id)).toBe(saved.url);
    expect(await store("ws-2").assetUrl("mine", saved.id)).toBeNull();
    expect(await store("ws-1").assetUrl("elsewhere", saved.id)).toBeNull();
  });

  it("only writes values to properties of the row's own database and clears the ones Notion emptied", async () => {
    seedPage("mine", "user-1", "ws-1");
    seedPage("row", "user-1", "ws-1");
    const s = store("ws-1");
    const { databaseId, propertyIds } = await s.writeDatabase("mine", [
      { name: "Qty", type: "NUMBER", config: null },
      { name: "Note", type: "TEXT", config: null },
    ]);
    const qty = propertyIds.get("Qty") as string;
    const note = propertyIds.get("Note") as string;
    await s.writeRecord(
      "row",
      databaseId,
      1024,
      new Map<string, string | number>([
        [qty, 3],
        ["foreign-property", "x"],
      ]),
      [qty, note]
    );
    const upserts = jest
      .mocked(prisma.databaseValue.upsert)
      .mock.calls.map((c) => c[0].create.propertyId);
    expect(upserts).toEqual([qty]);
    expect(prisma.databaseValue.deleteMany).toHaveBeenCalledWith({
      where: { recordId: "rec-row", propertyId: { in: [note] } },
    });
  });
});
