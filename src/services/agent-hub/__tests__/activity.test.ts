import { prisma } from "@/lib/prisma";

import { listActivity } from "../activity";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    hubItemEvent: { findMany: jest.fn() },
    hubAgent: { findMany: jest.fn() },
  },
}));
jest.mock("../limits", () => ({
  historyWindow: jest.fn(async () => ({
    since: new Date("2026-10-27T00:00:00Z"),
    limited: true,
  })),
}));

const events = prisma.hubItemEvent.findMany as jest.Mock;
const agents = prisma.hubAgent.findMany as jest.Mock;
const key = { userId: "u1", workspaceId: "w1" };

const row = (id: string, type: string, extra = {}) => ({
  id,
  at: new Date("2026-11-02T10:00:00Z"),
  actorKind: "agent",
  actorAgentId: "a1",
  type,
  message: "m",
  item: { id: "i1", title: "Post it" },
  ...extra,
});

beforeEach(() => {
  jest.clearAllMocks();
  agents.mockResolvedValue([{ id: "a1", name: "Grok" }]);
});

describe("hub activity feed", () => {
  it("scopes to the plan window and workspace, newest first", async () => {
    events.mockResolvedValue([]);
    await listActivity(key, {});
    const args = events.mock.calls[0][0];
    expect(args.where.at).toEqual({ gte: new Date("2026-10-27T00:00:00Z") });
    expect(args.where.item).toEqual({ userId: "u1", workspaceId: "w1" });
    expect(args.orderBy[0]).toEqual({ at: "desc" });
    expect(args.take).toBe(51);
  });

  it("maps stored types to feed kinds and drops plumbing", async () => {
    events.mockResolvedValue([
      row("1", "owner_answer", { actorKind: "owner", actorAgentId: null }),
      row("2", "heartbeat"),
      row("3", "update"),
      row("4", "failed"),
    ]);
    const out = await listActivity(key, {});
    expect(out.events.map((e) => e.kind)).toEqual([
      "answered",
      "updated",
      "completed",
    ]);
    expect(out.events[1].actor).toMatchObject({ name: "Grok" });
  });

  it("filters by agent and paginates 50 with a cursor", async () => {
    events.mockResolvedValue(
      Array.from({ length: 51 }, (_, n) => row(`e${n}`, "claimed"))
    );
    const out = await listActivity(key, { agent: "Grok", cursor: "x" });
    const args = events.mock.calls[0][0];
    expect(args.where.actorAgentId).toEqual({ in: ["a1"] });
    expect(args.cursor).toEqual({ id: "x" });
    expect(out.events).toHaveLength(50);
    expect(out.nextCursor).toBe("e49");
  });

  it("filters by kind", async () => {
    events.mockResolvedValue([]);
    await listActivity(key, { kinds: ["completed"] });
    expect(events.mock.calls[0][0].where.type).toEqual({
      in: ["completed", "failed"],
    });
  });
});
