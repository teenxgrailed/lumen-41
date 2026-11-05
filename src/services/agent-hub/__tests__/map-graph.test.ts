import { prisma } from "@/lib/prisma";

import { mapGraph } from "../map-graph";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    hubItemEvent: { findMany: jest.fn() },
    hubThread: { findMany: jest.fn() },
    hubMessage: { count: jest.fn() },
  },
}));

const events = prisma.hubItemEvent.findMany as jest.Mock;
const threads = prisma.hubThread.findMany as jest.Mock;
const count = prisma.hubMessage.count as jest.Mock;
const key = { userId: "u1", workspaceId: "w1" };
const NOW = new Date("2026-11-05T15:00:00Z");

beforeEach(() => {
  jest.clearAllMocks();
  threads.mockResolvedValue([
    { id: "t1", itemId: "i1", lastMessageAt: new Date("2026-11-05T10:00:00Z") },
  ]);
  count.mockResolvedValue(4);
});

describe("map graph", () => {
  it("counts each agent's events per UTC day, oldest first", async () => {
    events.mockResolvedValue([
      { actorAgentId: "a1", at: new Date("2026-11-05T09:00:00Z") },
      { actorAgentId: "a1", at: new Date("2026-11-05T01:00:00Z") },
      { actorAgentId: "a1", at: new Date("2026-10-30T23:00:00Z") },
      { actorAgentId: "a2", at: new Date("2026-11-03T12:00:00Z") },
    ]);
    const graph = await mapGraph(key, NOW);
    expect(graph.since).toBe("2026-10-30T00:00:00.000Z");
    expect(graph.activity.a1).toEqual([1, 0, 0, 0, 0, 0, 2]);
    expect(graph.activity.a2).toEqual([0, 0, 0, 0, 1, 0, 0]);
    expect(graph.messagesThisWeek).toBe(4);
  });

  it("scopes every query to the owner's workspace and the window", async () => {
    events.mockResolvedValue([]);
    await mapGraph(key, NOW);
    const where = events.mock.calls[0][0].where;
    expect(where.item).toEqual(key);
    expect(where.at.gte.toISOString()).toBe("2026-10-30T00:00:00.000Z");
    expect(threads.mock.calls[0][0].where).toEqual(key);
    expect(count.mock.calls[0][0].where).toMatchObject(key);
  });

  it("returns threads as links only, without subjects or text", async () => {
    events.mockResolvedValue([]);
    const graph = await mapGraph(key, NOW);
    expect(graph.threads).toEqual([
      { id: "t1", itemId: "i1", lastMessageAt: "2026-11-05T10:00:00.000Z" },
    ]);
    expect(threads.mock.calls[0][0].select).toEqual({
      id: true,
      itemId: true,
      lastMessageAt: true,
    });
  });
});
