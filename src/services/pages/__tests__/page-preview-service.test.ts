import { listPages } from "@/services/pages/page-service";
import { WorkspaceRole } from "@prisma/client";

import type { WorkspaceAccess } from "@/lib/auth/workspace-auth";

const findMany = jest.fn();
const queryRaw = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: {
    page: { findMany: (...args: unknown[]) => findMany(...args) },
    $queryRaw: (...args: unknown[]) => queryRaw(...args),
  },
}));

const pageRow = (id: string, userId = "me") => ({
  id,
  userId,
  isPrivate: false,
  accessGrants: [],
});
const block = (
  pageId: string,
  position: number,
  text: string,
  id = `${pageId}-${position}`
) => ({
  pageId,
  id,
  type: "PARAGRAPH",
  position,
  content: { json: { type: "paragraph", content: [{ type: "text", text }] } },
  firstText: null,
});

const actor = {
  userId: "me",
  workspace: {
    workspaceId: "w1",
    role: WorkspaceRole.EDITOR,
    dataScope: { mode: "workspace", workspaceId: "w1" },
  } as unknown as WorkspaceAccess,
};

describe("GET /api/pages preview", () => {
  beforeEach(() => {
    findMany.mockReset();
    queryRaw.mockReset();
  });

  it("reads every page's blocks with ONE extra query, however many pages", async () => {
    const ids = Array.from({ length: 60 }, (_, i) => `p${i}`);
    findMany.mockResolvedValue(ids.map((id) => pageRow(id)));
    queryRaw.mockResolvedValue(ids.map((id) => block(id, 1024, `Hi ${id}`)));

    const pages = await listPages(actor, { preview: true });

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(pages).toHaveLength(60);
    expect(pages[7].preview).toEqual([{ type: "p", text: "Hi p7" }]);
  });

  it("asks only about the ids the scoped list returned", async () => {
    findMany.mockResolvedValue([pageRow("a"), pageRow("b", "other")]);
    queryRaw.mockResolvedValue([]);

    await listPages(actor, { preview: true });

    const sql = queryRaw.mock.calls[0][0] as { values: unknown[] };
    expect(sql.values).toContainEqual(["a", "b"]);
    // And that list came from the access-scoped findMany.
    expect(findMany.mock.calls[0][0].where).toMatchObject({
      trashedAt: null,
      workspaceId: "w1",
    });
  });

  it("gives a page with no blocks an empty preview and orders by position", async () => {
    findMany.mockResolvedValue([pageRow("a"), pageRow("b")]);
    queryRaw.mockResolvedValue([
      block("a", 2048, "second"),
      block("a", 1024, "first"),
    ]);

    const pages = await listPages(actor, { preview: true });

    expect(pages[0].preview?.map((r) => r.text)).toEqual(["first", "second"]);
    expect(pages[1].preview).toEqual([]);
  });

  it("makes no extra query without the option, for the trash, or for no pages", async () => {
    findMany.mockResolvedValue([pageRow("a")]);
    const plain = await listPages(actor);
    expect("preview" in plain[0]).toBe(false);
    const trash = await listPages(actor, { trashed: true, preview: true });
    expect("preview" in trash[0]).toBe(false);
    findMany.mockResolvedValue([]);
    await listPages(actor, { preview: true });
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("keeps the fields and the order the list already had", async () => {
    findMany.mockResolvedValue([pageRow("a")]);
    queryRaw.mockResolvedValue([]);
    const [withPreview] = await listPages(actor, { preview: true });
    const [without] = await listPages(actor);
    const { preview, ...rest } = withPreview;
    expect(preview).toEqual([]);
    expect(rest).toEqual(without);
    expect(findMany.mock.calls[0][0].orderBy).toEqual(
      findMany.mock.calls[1][0].orderBy
    );
  });
});
