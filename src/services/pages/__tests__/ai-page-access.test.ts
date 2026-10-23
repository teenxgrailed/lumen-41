import { PageAccessRole } from "@prisma/client";

import {
  isPageInPrivateTree,
  privateTreePageIds,
  withoutPrivateTrees,
} from "../ai-page-access";
import { pageActorCanAccess } from "../page-model";
import {
  appendPageBlocks,
  createPage,
  getPage,
  listPages,
} from "../page-service";
import { writePageBlocks } from "../page-write-path";

type Row = {
  id: string;
  parentId: string | null;
  isPrivate: boolean;
  title: string;
  userId: string;
  trashedAt: Date | null;
  accessGrants: never[];
  blocks: never[];
};

const mockState: { pages: Row[]; queries: number } = { pages: [], queries: 0 };

function row(id: string, parentId: string | null, isPrivate = false): Row {
  return {
    id,
    parentId,
    isPrivate,
    title: `Page ${id}`,
    userId: "u1",
    trashedAt: null,
    accessGrants: [],
    blocks: [],
  };
}

jest.mock("@/lib/prisma", () => ({
  prisma: {
    page: {
      findMany: jest.fn(
        async (args: { where?: { id?: { in?: string[] } } }) => {
          mockState.queries += 1;
          const ids = args.where?.id?.in;
          return mockState.pages.filter(
            (page) => (ids ? ids.includes(page.id) : true) && !page.trashedAt
          );
        }
      ),
      findFirst: jest.fn(async (args: { where: { id: string } }) => {
        return (
          mockState.pages.find((page) => page.id === args.where.id) ?? null
        );
      }),
      create: jest.fn(),
    },
  },
}));
jest.mock("@/services/pages/page-write-path", () => ({
  writePageBlocks: jest.fn(),
}));
jest.mock("@/services/pages/page-preview-service", () => ({
  loadPagePreviews: jest.fn().mockResolvedValue(new Map()),
}));

// A public page, a private journal with a daily note and a nested note under
// it, and a private leaf under the public page.
beforeEach(() => {
  jest.clearAllMocks();
  mockState.queries = 0;
  mockState.pages = [
    row("root", null),
    row("journal", null, true),
    row("daily", "journal"),
    row("nested", "daily"),
    row("leaf", "root", true),
  ];
});

const human = { userId: "u1" };
const ai = { userId: "u1", ai: true };

describe("private trees", () => {
  it("finds a page that is private, or sits anywhere under one", async () => {
    const blocked = await privateTreePageIds([
      "root",
      "journal",
      "daily",
      "nested",
      "leaf",
    ]);
    expect([...blocked].sort()).toEqual(["daily", "journal", "leaf", "nested"]);
    expect(await isPageInPrivateTree("root")).toBe(false);
    expect(await isPageInPrivateTree("nested")).toBe(true);
  });

  it("reads each level of ancestors once, not once per page", async () => {
    await privateTreePageIds(["nested"]);
    // nested -> daily -> journal, and the last level has no parent.
    expect(mockState.queries).toBe(3);
  });

  it("filters a list and keeps its order", async () => {
    const kept = await withoutPrivateTrees(mockState.pages);
    expect(kept.map((page) => page.id)).toEqual(["root"]);
  });

  it("survives a parent cycle and a parent that no longer exists", async () => {
    mockState.pages = [row("a", "b"), row("b", "a"), row("orphan", "gone")];
    expect((await privateTreePageIds(["a", "b", "orphan"])).size).toBe(0);
  });
});

describe("pages read as the AI", () => {
  it("lists no page in a private tree, while a person still sees them all", async () => {
    const asAi = await listPages(ai);
    expect(asAi.map((page) => page.id)).toEqual(["root"]);
    const asHuman = await listPages(human);
    expect(asHuman.map((page) => page.id).sort()).toEqual([
      "daily",
      "journal",
      "leaf",
      "nested",
      "root",
    ]);
  });

  it("does not return a private page, a daily note under one, or a note nested deeper", async () => {
    expect(await getPage(ai, "root")).toMatchObject({ id: "root" });
    for (const id of ["journal", "daily", "nested", "leaf"]) {
      expect(await getPage(ai, id)).toBeNull();
      // The same page is open to the person who owns it.
      expect(await getPage(human, id)).toMatchObject({ id });
    }
  });
});

describe("pages written as the AI", () => {
  it("does not append to a page in a private tree", async () => {
    const block = {
      type: "PARAGRAPH" as const,
      content: { text: "injected" },
      position: 1,
    };
    expect(await appendPageBlocks(ai, "daily", [block], "AI")).toBeNull();
    expect(await appendPageBlocks(ai, "nested", [block], "AI")).toBeNull();
    expect(writePageBlocks).not.toHaveBeenCalled();
  });

  it("does not file a new page under a private tree", async () => {
    await expect(
      createPage(ai, { title: "Child", parentId: "daily" })
    ).rejects.toThrow("Parent page not found");
    const { prisma } = jest.requireMock("@/lib/prisma");
    expect(prisma.page.create).not.toHaveBeenCalled();
  });

  it("denies the AI edit access to a private tree and grants it everywhere else", async () => {
    expect(
      await pageActorCanAccess(ai, "nested", PageAccessRole.EDITOR)
    ).toBeNull();
    expect(
      await pageActorCanAccess(ai, "root", PageAccessRole.EDITOR)
    ).not.toBeNull();
    expect(
      await pageActorCanAccess(human, "nested", PageAccessRole.EDITOR)
    ).not.toBeNull();
  });
});
