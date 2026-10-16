import { addCalendarDays, newDateFromYMD } from "@/lib/date-utils";

import { TRASH_RETENTION_DAYS, purgeExpiredTrash } from "../retention";

const taskFindMany = jest.fn();
const taskDelete = jest.fn();
const pageFindMany = jest.fn();
const pageDelete = jest.fn();
const proposalDeleteMany = jest.fn();
const boardDeleteMany = jest.fn();
const deleteBlock = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: {
    task: {
      findMany: (a: unknown) => taskFindMany(a),
      delete: (a: unknown) => taskDelete(a),
    },
    page: {
      findMany: (a: unknown) => pageFindMany(a),
      delete: (a: unknown) => pageDelete(a),
    },
    meetingNoteProposal: { deleteMany: (a: unknown) => proposalDeleteMany(a) },
    moodboard: { deleteMany: (a: unknown) => boardDeleteMany(a) },
    $transaction: (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/task-block-push", () => ({
  deleteTaskBlockEvent: (...a: unknown[]) => deleteBlock(...a),
}));
// The page and moodboard services pull in auth and storage the purge never uses.
jest.mock("@/services/pages/page-service", () => {
  const actual = jest.requireActual("@/services/pages/page-service");
  return actual;
});

const now = newDateFromYMD(2026, 10, 16);
const cutoff = addCalendarDays(now, -30);

beforeEach(() => {
  jest.clearAllMocks();
  taskFindMany.mockResolvedValue([]);
  pageFindMany.mockResolvedValue([]);
  boardDeleteMany.mockResolvedValue({ count: 0 });
});

describe("purgeExpiredTrash", () => {
  it("keeps Trash for 30 days", () => {
    expect(TRASH_RETENTION_DAYS).toBe(30);
  });

  it("deletes tasks, pages and moodboards trashed before the cutoff", async () => {
    taskFindMany.mockResolvedValue([
      {
        id: "t1",
        assigneeId: null,
        userId: "u1",
        blockEventId: "e1",
        blockFeedId: "f1",
      },
    ]);
    pageFindMany.mockResolvedValue([{ id: "p1" }]);
    boardDeleteMany.mockResolvedValue({ count: 2 });

    await expect(purgeExpiredTrash(now)).resolves.toEqual({
      tasks: 1,
      pages: 1,
      boards: 2,
    });

    expect(taskFindMany.mock.calls[0][0].where).toEqual({
      trashedAt: { not: null, lt: cutoff },
    });
    expect(deleteBlock).toHaveBeenCalledWith("u1", "e1", "f1");
    expect(taskDelete).toHaveBeenCalledWith({ where: { id: "t1" } });
    expect(proposalDeleteMany).toHaveBeenCalledWith({
      where: { pageId: "p1" },
    });
    expect(pageDelete).toHaveBeenCalledWith({ where: { id: "p1" } });
    expect(boardDeleteMany).toHaveBeenCalledWith({
      where: { trashedAt: { not: null, lt: cutoff } },
    });
  });

  it("one task that cannot go does not stop the rest, nor the other kinds", async () => {
    taskFindMany.mockResolvedValue([
      {
        id: "t1",
        assigneeId: null,
        userId: "u1",
        blockEventId: null,
        blockFeedId: null,
      },
      {
        id: "t2",
        assigneeId: null,
        userId: "u1",
        blockEventId: null,
        blockFeedId: null,
      },
    ]);
    taskDelete.mockRejectedValueOnce(new Error("occurrences remain"));
    pageFindMany.mockResolvedValue([{ id: "p1" }]);

    const result = await purgeExpiredTrash(now);

    expect(result).toEqual({ tasks: 1, pages: 1, boards: 0 });
    expect(taskDelete).toHaveBeenCalledTimes(2);
  });

  it("a failing kind is logged and the others still run", async () => {
    taskFindMany.mockRejectedValue(new Error("db down"));
    boardDeleteMany.mockResolvedValue({ count: 1 });

    await expect(purgeExpiredTrash(now)).resolves.toEqual({
      tasks: 0,
      pages: 0,
      boards: 1,
    });
  });
});
