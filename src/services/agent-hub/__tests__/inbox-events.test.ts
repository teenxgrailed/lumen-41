import { prisma } from "@/lib/prisma";

import { eventsFor } from "../inbox";
import { historyWindow } from "../limits";

jest.mock("@/lib/prisma", () => ({
  prisma: { hubItemEvent: { findMany: jest.fn() } },
}));
jest.mock("../limits", () => ({ historyWindow: jest.fn() }));
jest.mock("../items", () => ({}));
jest.mock("../deps", () => ({}));
jest.mock("../agent-limits", () => ({}));
jest.mock("../messages", () => ({}));
jest.mock("../reservations", () => ({}));
jest.mock("../sweep", () => ({}));

const findMany = prisma.hubItemEvent.findMany as jest.Mock;
const since = new Date("2026-11-01T00:00:00Z");

function event(itemId: string, minute: number) {
  return {
    id: `${itemId}-${minute}`,
    itemId,
    at: new Date(Date.UTC(2026, 10, 20, 12, minute)),
  };
}

describe("inbox events", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(historyWindow).mockResolvedValue({ since, limited: false });
  });

  it("reads the events of every item in one query", async () => {
    findMany.mockResolvedValue([event("a", 3), event("b", 2), event("a", 1)]);

    const byItem = await eventsFor("u1", ["a", "b", "c"]);

    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany).toHaveBeenCalledWith({
      where: { itemId: { in: ["a", "b", "c"] }, at: { gte: since } },
      orderBy: [{ at: "desc" }],
    });
    expect(byItem.get("a")?.map((row) => row.id)).toEqual(["a-1", "a-3"]);
    expect(byItem.get("b")?.map((row) => row.id)).toEqual(["b-2"]);
    expect(byItem.get("c")).toEqual([]);
  });

  it("keeps the newest five per item, oldest first", async () => {
    findMany.mockResolvedValue(
      [9, 8, 7, 6, 5, 4, 3].map((minute) => event("a", minute))
    );

    const byItem = await eventsFor("u1", ["a"]);

    expect(byItem.get("a")?.map((row) => row.id)).toEqual([
      "a-5",
      "a-6",
      "a-7",
      "a-8",
      "a-9",
    ]);
  });

  it("asks for nothing when there are no items", async () => {
    expect((await eventsFor("u1", [])).size).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("on a limited history gives an item without events its latest one, in one more query", async () => {
    jest.mocked(historyWindow).mockResolvedValue({ since, limited: true });
    findMany
      .mockResolvedValueOnce([event("a", 3)])
      .mockResolvedValueOnce([event("b", 9), event("b", 1), event("c", 2)]);

    const byItem = await eventsFor("u1", ["a", "b", "c"]);

    expect(findMany).toHaveBeenCalledTimes(2);
    expect(findMany).toHaveBeenLastCalledWith({
      where: { itemId: { in: ["b", "c"] } },
      orderBy: [{ at: "desc" }],
    });
    expect(byItem.get("a")?.map((row) => row.id)).toEqual(["a-3"]);
    expect(byItem.get("b")?.map((row) => row.id)).toEqual(["b-9"]);
    expect(byItem.get("c")?.map((row) => row.id)).toEqual(["c-2"]);
  });
});
