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

/** A database with these events: honours itemId, `at` and take, newest first. */
function database(rows: ReturnType<typeof event>[]) {
  findMany.mockImplementation(
    async (args: {
      where: { itemId: string; at?: { gte: Date } };
      take?: number;
    }) =>
      rows
        .filter(
          (row) =>
            row.itemId === args.where.itemId &&
            (!args.where.at || row.at >= args.where.at.gte)
        )
        .sort((a, b) => b.at.getTime() - a.at.getTime())
        .slice(0, args.take)
  );
}

describe("inbox events", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(historyWindow).mockResolvedValue({ since, limited: false });
  });

  it("gives each item its own events, oldest first", async () => {
    database([event("a", 3), event("b", 2), event("a", 1)]);

    const byItem = await eventsFor("u1", ["a", "b", "c"]);

    expect(byItem.get("a")?.map((row) => row.id)).toEqual(["a-1", "a-3"]);
    expect(byItem.get("b")?.map((row) => row.id)).toEqual(["b-2"]);
    expect(byItem.get("c")).toEqual([]);
  });

  it("limits every item to its newest five", async () => {
    database([1, 2, 3, 4, 5, 6, 7, 8].map((minute) => event("a", minute)));

    const byItem = await eventsFor("u1", ["a"]);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5 }));
    expect(byItem.get("a")?.map((row) => row.id)).toEqual([
      "a-4",
      "a-5",
      "a-6",
      "a-7",
      "a-8",
    ]);
  });

  it("runs the item queries together but never more than five at a time", async () => {
    let inFlight = 0;
    let peak = 0;
    findMany.mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return [];
    });
    await eventsFor("u1", ["a", "b", "c", "d", "e", "f", "g", "h"]);
    expect(findMany).toHaveBeenCalledTimes(8);
    expect(peak).toBe(5);
  });

  it("asks for nothing when there are no items", async () => {
    expect((await eventsFor("u1", [])).size).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("on a limited history an item without events keeps only its latest one", async () => {
    jest.mocked(historyWindow).mockResolvedValue({ since, limited: true });
    const old = (minute: number) => ({
      ...event("b", minute),
      at: new Date(Date.UTC(2026, 9, 1, 12, minute)),
    });
    database([event("a", 3), old(1), old(9), old(5)]);

    const byItem = await eventsFor("u1", ["a", "b"]);

    expect(byItem.get("a")?.map((row) => row.id)).toEqual(["a-3"]);
    expect(byItem.get("b")?.map((row) => row.id)).toEqual(["b-9"]);
    expect(findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: 1 })
    );
  });
});
