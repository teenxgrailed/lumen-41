import { pageActorCanAccess } from "@/services/pages/page-model";
import { appendPageBlocks, createPage } from "@/services/pages/page-service";
import {
  PageCollaborationActiveError,
  writePageBlocks,
} from "@/services/pages/page-write-path";

import { LiveTableInputError } from "@/lib/live-tables/schema";
import { prisma } from "@/lib/prisma";

import {
  LiveTableNotFoundError,
  LiveTablePageNotEditableError,
  appendLiveTableRows,
  createLiveTable,
  updateLiveTableRow,
} from "../live-table-service";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    liveTable: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    liveTableRow: {
      createMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));
jest.mock("@/services/pages/page-model", () => ({
  pageActorCanAccess: jest.fn(),
}));
jest.mock("@/services/pages/page-service", () => ({
  appendPageBlocks: jest.fn(),
  createPage: jest.fn(),
}));
jest.mock("@/services/pages/page-write-path", () => {
  class PageCollaborationActiveError extends Error {}
  class PageRevisionConflictError extends Error {}
  return {
    PageCollaborationActiveError,
    PageRevisionConflictError,
    writePageBlocks: jest.fn(),
  };
});

const db = prisma as unknown as {
  liveTable: Record<string, jest.Mock>;
  liveTableRow: Record<string, jest.Mock>;
  $transaction: jest.Mock;
};
const access = pageActorCanAccess as jest.Mock;
const actor = { userId: "u1", ai: true };
const columns = [
  { id: "c1", name: "Model", type: "text" },
  { id: "c2", name: "Status", type: "select", options: ["Yes", "No"] },
];
const stored = {
  id: "t1",
  pageId: "p1",
  title: "Mics",
  columns,
  createdBy: "AI",
  createdAt: new Date("2026-11-12T10:00:00Z"),
  updatedAt: new Date("2026-11-12T10:00:00Z"),
  rows: [{ id: "r1", position: 1024, cells: { c1: "A", c2: "Yes" } }],
};

beforeEach(() => {
  jest.clearAllMocks();
  access.mockResolvedValue({ id: "p1" });
  db.liveTable.create.mockResolvedValue({ ...stored, rows: undefined });
  db.liveTable.findUnique.mockResolvedValue(stored);
  db.liveTable.delete.mockResolvedValue({});
  db.$transaction.mockResolvedValue([]);
  (appendPageBlocks as jest.Mock).mockResolvedValue({ id: "p1" });
});

describe("createLiveTable", () => {
  it("places the table block at the end of an editable page", async () => {
    const table = await createLiveTable(actor, {
      pageId: "p1",
      title: "Mics",
      columns: [
        { name: "Model" },
        { name: "Status", type: "select", options: ["Yes", "No"] },
      ],
      rows: [["A", "yes"]],
    });
    expect(table.id).toBe("t1");
    expect(db.liveTableRow.createMany).toHaveBeenCalledWith({
      data: [{ tableId: "t1", position: 1024, cells: { c1: "A", c2: "Yes" } }],
    });
    const [, pageId, blocks] = (appendPageBlocks as jest.Mock).mock.calls[0];
    expect(pageId).toBe("p1");
    expect(blocks[0]).toMatchObject({
      type: "LIVE_TABLE",
      content: { json: { type: "needtLiveTable", attrs: { tableId: "t1" } } },
    });
  });

  it("makes a new page when no page is given", async () => {
    (createPage as jest.Mock).mockResolvedValue({
      id: "p2",
      contentRevision: 0,
      documentFormatVersion: 1,
    });
    (writePageBlocks as jest.Mock).mockResolvedValue({ id: "p2" });
    await createLiveTable(actor, { title: "Mics", columns: [{ name: "A" }] });
    expect(createPage).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({ title: "Mics" })
    );
    expect((writePageBlocks as jest.Mock).mock.calls[0][1]).toBe("p2");
  });

  it("checks every row before writing anything", async () => {
    await expect(
      createLiveTable(actor, {
        pageId: "p1",
        title: "Mics",
        columns: [{ name: "S", type: "select", options: ["Yes"] }],
        rows: [["Maybe"]],
      })
    ).rejects.toThrow(LiveTableInputError);
    expect(db.liveTable.create).not.toHaveBeenCalled();
  });

  it("refuses a page the actor cannot edit", async () => {
    access.mockResolvedValue(null);
    await expect(
      createLiveTable(actor, { pageId: "p1", title: "T", columns: [{ name: "A" }] })
    ).rejects.toThrow(LiveTablePageNotEditableError);
  });

  it("removes the table again when the page is open for live editing", async () => {
    (appendPageBlocks as jest.Mock).mockRejectedValue(
      new PageCollaborationActiveError()
    );
    await expect(
      createLiveTable(actor, { pageId: "p1", title: "T", columns: [{ name: "A" }] })
    ).rejects.toBeInstanceOf(PageCollaborationActiveError);
    expect(db.liveTable.delete).toHaveBeenCalledWith({ where: { id: "t1" } });
  });
});

describe("rows", () => {
  it("appends after the last row", async () => {
    await appendLiveTableRows(actor, "t1", [{ Model: "B", Status: "No" }]);
    expect(db.liveTableRow.createMany).toHaveBeenCalledWith({
      data: [{ tableId: "t1", position: 2048, cells: { c1: "B", c2: "No" } }],
    });
  });

  it("hides a table on a page the actor cannot read", async () => {
    access.mockResolvedValue(null);
    await expect(appendLiveTableRows(actor, "t1", [["B"]])).rejects.toThrow(
      LiveTableNotFoundError
    );
  });

  it("says a readable page is not editable", async () => {
    access.mockImplementation(async (_actor, _page, role) =>
      role === "VIEWER" ? { id: "p1" } : null
    );
    await expect(appendLiveTableRows(actor, "t1", [["B"]])).rejects.toThrow(
      LiveTablePageNotEditableError
    );
  });

  it("updates named cells and keeps the rest", async () => {
    await updateLiveTableRow(actor, "t1", "r1", { status: "no" });
    expect(db.liveTableRow.update).toHaveBeenCalledWith({
      where: { id: "r1" },
      data: { cells: { c1: "A", c2: "No" } },
    });
  });
});
