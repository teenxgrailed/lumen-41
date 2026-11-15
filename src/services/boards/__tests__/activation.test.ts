import { recordActivation } from "@/lib/activation-events";
import { prisma } from "@/lib/prisma";

import { addCard } from "../boardService";

jest.mock("@/lib/activation-events", () => ({ recordActivation: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    boardColumn: { findFirst: jest.fn() },
    task: { findFirst: jest.fn(), create: jest.fn() },
  },
}));

const input = { boardId: "b1", columnId: "c1", title: "Card" };

beforeEach(() => jest.clearAllMocks());

describe("addCard activation", () => {
  it("records task_created after the card is written and returns the card", async () => {
    jest
      .mocked(prisma.boardColumn.findFirst)
      .mockResolvedValue({ id: "c1", board: { workspaceId: "ws-1" } } as never);
    jest.mocked(prisma.task.findFirst).mockResolvedValue(null);
    jest.mocked(prisma.task.create).mockResolvedValue({ id: "t1" } as never);

    await expect(addCard("user-1", input)).resolves.toEqual({ id: "t1" });
    expect(recordActivation).toHaveBeenCalledWith("task_created", "user-1", {
      source: "board",
    });
  });

  it("records nothing when the column is not the user's", async () => {
    jest.mocked(prisma.boardColumn.findFirst).mockResolvedValue(null);
    await expect(addCard("user-1", input)).resolves.toBeNull();
    expect(recordActivation).not.toHaveBeenCalled();
  });

  it("records nothing when the write fails", async () => {
    jest
      .mocked(prisma.boardColumn.findFirst)
      .mockResolvedValue({ id: "c1", board: { workspaceId: "ws-1" } } as never);
    jest.mocked(prisma.task.findFirst).mockResolvedValue(null);
    jest.mocked(prisma.task.create).mockRejectedValue(new Error("db"));
    await expect(addCard("user-1", input)).rejects.toThrow("db");
    expect(recordActivation).not.toHaveBeenCalled();
  });
});
