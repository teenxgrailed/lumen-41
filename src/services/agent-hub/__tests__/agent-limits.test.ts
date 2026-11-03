/**
 * Per-agent workload limits (owner decision 2026-11-03): a cap on held items,
 * a cap on fresh claims per UTC day, an inbox size, and large items kept from
 * agents that do not accept them. No limits (the default) changes nothing.
 */
import type { HubAgent, HubItem } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import {
  agentLimits,
  agentLimitsSchema,
  claimsToday,
  dayStart,
  limitsColumn,
  offersItem,
  workloadGate,
} from "../agent-limits";
import { ownerUpdateAgent, registerAgent } from "../agents";
import type { AgentScope, HubScope } from "../context";
import { HubError } from "../errors";
import { agentInbox, nextItem, readyItems } from "../inbox";
import { claimItem } from "../items";
import { historyWindow } from "../limits";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    hubAgent: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    hubItem: {
      count: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    hubItemEvent: { count: jest.fn(), findMany: jest.fn() },
    hubItemLink: { findMany: jest.fn() },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
  },
}));
jest.mock("../limits", () => ({
  ...jest.requireActual("../limits"),
  historyWindow: jest.fn(),
}));
jest.mock("../sweep", () => ({ sweepHub: jest.fn() }));
jest.mock("../messages", () => ({
  unreadMessageCount: jest.fn(async () => 0),
}));
jest.mock("../reservations", () => ({
  myReservations: jest.fn(async () => []),
}));
jest.mock("../webhooks", () => ({
  emitHubEvent: jest.fn(),
  itemPayload: jest.fn(() => ({})),
}));

type InboxResult = {
  items: { id: string }[];
  limited?: { scope: string };
};

const db = prisma as unknown as {
  hubAgent: { update: jest.Mock; findFirst: jest.Mock; findMany: jest.Mock };
  hubItem: {
    count: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    updateMany: jest.Mock;
  };
  hubItemEvent: { count: jest.Mock; findMany: jest.Mock };
  hubItemLink: { findMany: jest.Mock };
  $queryRaw: jest.Mock;
  $transaction: jest.Mock;
};

const NOW = new Date("2026-11-04T10:00:00.000Z");

function agent(limits: unknown = null, id = "grok"): HubAgent {
  return {
    id,
    userId: "u1",
    workspaceId: "w1",
    connectionKey: `token:${id}`,
    name: id,
    kind: "grok",
    capabilities: "",
    skills: ["browser"],
    limits: limits as HubAgent["limits"],
    lastSeenAt: null,
    disabledAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function scopeOf(self: HubAgent): AgentScope {
  return {
    userId: "u1",
    workspaceId: "w1",
    actor: { kind: "agent", agent: self },
  };
}

function item(over: Partial<HubItem> = {}): HubItem {
  return {
    id: "i1",
    userId: "u1",
    workspaceId: "w1",
    title: "t",
    goal: "g",
    doneCriteria: "d",
    context: "c",
    links: [],
    risks: [],
    approvals: {},
    status: "open",
    assigneeAgentId: null,
    requiredSkills: ["browser"],
    creatorKind: "owner",
    creatorAgentId: null,
    claimedByAgentId: null,
    leaseExpiresAt: null,
    leaseExpiredNotedAt: null,
    due: null,
    result: null,
    blockedOn: null,
    question: null,
    taskId: null,
    projectId: null,
    escalationTaskId: null,
    noAgentTaskId: null,
    ownerUnread: false,
    ownerAlertedAt: null,
    noAgentAlertedAt: null,
    clientRef: null,
    recurrenceId: null,
    occurrenceAt: null,
    criteriaItems: [],
    usageTokens: null,
    usageCostUsd: null,
    usageMinutes: null,
    large: false,
    largeApprovedAt: null,
    version: 1,
    createdAt: new Date("2026-11-01T00:00:00.000Z"),
    updatedAt: NOW,
    closedAt: null,
    ...over,
  } as HubItem;
}

beforeEach(() => {
  jest.resetAllMocks();
  (historyWindow as jest.Mock).mockResolvedValue({
    since: new Date("2026-10-01T00:00:00.000Z"),
    limited: false,
  });
  jest.useFakeTimers().setSystemTime(NOW);
  db.hubItem.findMany.mockResolvedValue([]);
  db.hubItemEvent.findMany.mockResolvedValue([]);
  db.hubItemLink.findMany.mockResolvedValue([]);
  db.hubAgent.findMany.mockResolvedValue([]);
  db.$queryRaw.mockResolvedValue([]);
});
afterEach(() => jest.useRealTimers());

describe("limits column", () => {
  it("defaults to no limits, and a malformed column counts as none", () => {
    expect(agentLimits(agent(null))).toEqual({
      maxInProgress: null,
      maxClaimsPerDay: null,
      inboxLimit: null,
      acceptsLarge: true,
    });
    expect(
      agentLimits(agent({ maxInProgress: "two" })).maxInProgress
    ).toBeNull();
  });

  it("reads each key", () => {
    expect(
      agentLimits(
        agent({
          maxInProgress: 2,
          maxClaimsPerDay: 5,
          inboxLimit: 3,
          acceptsLarge: false,
        })
      )
    ).toEqual({
      maxInProgress: 2,
      maxClaimsPerDay: 5,
      inboxLimit: 3,
      acceptsLarge: false,
    });
  });

  it("stores only the keys that are set, and null when nothing is", () => {
    expect(limitsColumn({ maxInProgress: 2, inboxLimit: null })).toEqual({
      maxInProgress: 2,
    });
    expect(limitsColumn({ acceptsLarge: true })).not.toEqual({
      acceptsLarge: true,
    });
    expect(limitsColumn(null)).toBeDefined();
  });

  it("rejects unknown keys and out-of-range numbers", () => {
    expect(agentLimitsSchema.safeParse({ nope: 1 }).success).toBe(false);
    expect(agentLimitsSchema.safeParse({ maxInProgress: 0 }).success).toBe(
      false
    );
    expect(agentLimitsSchema.safeParse({ inboxLimit: 26 }).success).toBe(false);
    expect(agentLimitsSchema.safeParse({ maxInProgress: 2 }).success).toBe(
      true
    );
  });

  it("starts a day at 00:00 UTC", () => {
    expect(dayStart(NOW).toISOString()).toBe("2026-11-04T00:00:00.000Z");
  });
});

describe("workloadGate", () => {
  it("asks the database nothing for an agent without limits", async () => {
    await expect(workloadGate(agent(null))).resolves.toEqual({ blocked: null });
    expect(db.hubItem.count).not.toHaveBeenCalled();
    expect(db.hubItemEvent.count).not.toHaveBeenCalled();
  });

  it("blocks at the in-progress cap and not below it", async () => {
    const limited = agent({ maxInProgress: 2 });
    db.hubItem.count.mockResolvedValueOnce(1);
    expect((await workloadGate(limited)).blocked).toBeNull();
    db.hubItem.count.mockResolvedValueOnce(2);
    const gate = await workloadGate(limited);
    expect(gate.blocked).toMatchObject({
      scope: "in_progress",
      limit: 2,
      used: 2,
      retryAfterSeconds: null,
    });
    // Claimed, in_progress and blocked count as held.
    expect(db.hubItem.count).toHaveBeenLastCalledWith({
      where: {
        claimedByAgentId: "grok",
        status: { in: ["claimed", "in_progress", "blocked"] },
      },
    });
  });

  it("blocks at the daily cap with the seconds until 00:00 UTC", async () => {
    db.hubItemEvent.count.mockResolvedValue(3);
    const gate = await workloadGate(agent({ maxClaimsPerDay: 3 }), NOW);
    expect(gate.blocked).toMatchObject({
      scope: "daily",
      limit: 3,
      used: 3,
      retryAfterSeconds: 14 * 3600,
    });
  });

  it("counts only fresh claims made today by this agent", async () => {
    db.hubItemEvent.count.mockResolvedValue(0);
    await claimsToday("grok", NOW);
    expect(db.hubItemEvent.count).toHaveBeenCalledWith({
      where: {
        actorKind: "agent",
        actorAgentId: "grok",
        type: "claimed",
        at: { gte: new Date("2026-11-04T00:00:00.000Z") },
        data: { path: ["fresh"], equals: true },
      },
    });
  });
});

describe("claimItem", () => {
  it("refuses with a retryable AGENT_LIMIT at the in-progress cap", async () => {
    const self = agent({ maxInProgress: 2 });
    db.hubItem.findFirst.mockResolvedValue(item());
    db.hubItem.count.mockResolvedValue(2);
    const error = await claimItem(scopeOf(self), { id: "i1" }).catch(
      (e: unknown) => e
    );
    expect(error).toBeInstanceOf(HubError);
    expect((error as HubError).code).toBe("AGENT_LIMIT");
    expect((error as HubError).status).toBe(429);
    expect((error as HubError).body()).toMatchObject({
      scope: "in_progress",
      retryable: true,
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("refuses at the daily cap and says when to retry", async () => {
    const self = agent({ maxClaimsPerDay: 1 });
    db.hubItem.findFirst.mockResolvedValue(item());
    db.hubItemEvent.count.mockResolvedValue(1);
    const error = (await claimItem(scopeOf(self), { id: "i1" }).catch(
      (e: unknown) => e
    )) as HubError;
    expect(error.code).toBe("AGENT_LIMIT");
    expect(error.extra).toMatchObject({
      scope: "daily",
      retryAfterSeconds: 14 * 3600,
    });
  });

  it("leaves an agent without limits unchanged and marks the claim fresh", async () => {
    const self = agent(null);
    db.hubItem.findFirst.mockResolvedValue(item());
    const created: unknown[] = [];
    db.$transaction.mockImplementation(async (work: (tx: unknown) => unknown) =>
      work({
        hubItem: {
          updateMany: jest.fn(async () => ({ count: 1 })),
          findUniqueOrThrow: jest.fn(async () => {
            throw new Error("stop");
          }),
        },
        hubItemEvent: {
          create: jest.fn(async (args: unknown) => created.push(args)),
        },
      })
    );
    await expect(claimItem(scopeOf(self), { id: "i1" })).rejects.toThrow(
      "stop"
    );
    expect(db.hubItem.count).not.toHaveBeenCalled();
    expect(db.hubItemEvent.count).not.toHaveBeenCalled();
    expect(created[0]).toMatchObject({
      data: { type: "claimed", data: { fresh: true } },
    });
  });

  it("does not count a holder's re-claim against the caps", async () => {
    const self = agent({ maxInProgress: 1, maxClaimsPerDay: 1 });
    db.hubItem.findFirst.mockResolvedValue(
      item({
        status: "in_progress",
        claimedByAgentId: "grok",
        leaseExpiresAt: new Date("2026-11-04T11:00:00.000Z"),
      })
    );
    const created: unknown[] = [];
    db.$transaction.mockImplementation(async (work: (tx: unknown) => unknown) =>
      work({
        hubItem: {
          updateMany: jest.fn(async () => ({ count: 1 })),
          findUniqueOrThrow: jest.fn(async () => {
            throw new Error("stop");
          }),
        },
        hubItemEvent: {
          create: jest.fn(async (args: unknown) => created.push(args)),
        },
      })
    );
    db.hubItem.count.mockResolvedValue(1);
    db.hubItemEvent.count.mockResolvedValue(1);
    await expect(claimItem(scopeOf(self), { id: "i1" })).rejects.toThrow(
      "stop"
    );
    expect(created[0]).toMatchObject({ data: { data: { fresh: false } } });
  });

  it("refuses a large item to an agent that does not accept large work", async () => {
    const self = agent({ acceptsLarge: false });
    db.hubItem.findFirst.mockResolvedValue(item({ large: true }));
    const error = (await claimItem(scopeOf(self), { id: "i1" }).catch(
      (e: unknown) => e
    )) as HubError;
    expect(error.code).toBe("NOT_ELIGIBLE");
    expect(error.extra).toMatchObject({ large: true });
  });

  it("lets the same agent claim a large item the owner approved", async () => {
    const self = agent({ acceptsLarge: false });
    db.hubItem.findFirst.mockResolvedValue(
      item({ large: true, largeApprovedAt: NOW })
    );
    db.$transaction.mockRejectedValue(new Error("stop"));
    await expect(claimItem(scopeOf(self), { id: "i1" })).rejects.toThrow(
      "stop"
    );
  });
});

describe("offersItem", () => {
  const strict = agentLimits(agent({ acceptsLarge: false }));
  const open = agentLimits(agent(null));
  it("hides unapproved large items only from agents that refuse them", () => {
    const large = { large: true, largeApprovedAt: null };
    expect(offersItem(large, strict)).toBe(false);
    expect(offersItem(large, open)).toBe(true);
    expect(offersItem({ large: true, largeApprovedAt: NOW }, strict)).toBe(
      true
    );
    expect(offersItem({ large: false, largeApprovedAt: null }, strict)).toBe(
      true
    );
  });
});

describe("next and inbox", () => {
  it("next offers nothing at a cap, with a retryable reason, and keeps what it holds", async () => {
    const self = agent({ maxClaimsPerDay: 2 });
    db.hubItemEvent.count.mockResolvedValue(2);
    db.hubItem.findMany.mockResolvedValue([]);
    const result = await nextItem(scopeOf(self));
    expect(result.item).toBeNull();
    expect(result.limited).toMatchObject({ scope: "daily", retryable: true });
    expect(result.notice).toMatch(/daily limit/);
    expect(db.$queryRaw).not.toHaveBeenCalled();
  });

  it("inbox view ready is empty at a cap", async () => {
    const self = agent({ maxInProgress: 2 });
    db.hubItem.count.mockResolvedValue(2);
    const result = (await agentInbox(scopeOf(self), {
      view: "ready",
    })) as unknown as InboxResult;
    expect(result.items).toEqual([]);
    expect(result.limited).toMatchObject({ scope: "in_progress" });
  });

  it("the default inbox hides claimable items at a cap but keeps held ones", async () => {
    const self = agent({ maxInProgress: 1 });
    db.hubItem.count.mockResolvedValue(1);
    const held = item({
      id: "held",
      status: "in_progress",
      claimedByAgentId: "grok",
      leaseExpiresAt: new Date("2026-11-04T11:00:00.000Z"),
    });
    db.hubItem.findMany.mockImplementation(
      async (args: { where: { status?: unknown } }) =>
        args.where.status === "open" ? [item({ id: "waiting" })] : [held]
    );
    const result = (await agentInbox(
      scopeOf(self),
      {}
    )) as unknown as InboxResult;
    expect(result.items.map((i) => i.id)).toEqual(["held"]);
  });
});

describe("readyItems", () => {
  function queue(ids: string[], extra: Partial<HubItem>[] = []) {
    const rows = ids.map((id, index) =>
      item({
        id,
        createdAt: new Date(2026, 10, 1, index),
        ...(extra[index] ?? {}),
      })
    );
    db.hubItem.findMany.mockImplementation(
      async (args: { where: { assigneeAgentId?: unknown; id?: unknown } }) =>
        args.where.id ? rows : []
    );
    db.$queryRaw.mockResolvedValue(rows.map((row) => ({ id: row.id })));
  }

  it("returns the whole queue for an agent without limits", async () => {
    queue(["a", "b", "c", "d"]);
    const ready = await readyItems(scopeOf(agent(null)), 10);
    expect(ready.map((i) => i.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("returns only the top inboxLimit items, best first", async () => {
    queue(["a", "b", "c", "d"], [{}, { due: new Date("2026-11-02") }, {}, {}]);
    const ready = await readyItems(scopeOf(agent({ inboxLimit: 2 })), 10);
    // Earlier due date ranks first, then the oldest.
    expect(ready.map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("skips unapproved large items for an agent that refuses them", async () => {
    queue(
      ["a", "b", "c"],
      [{ large: true }, { large: true, largeApprovedAt: NOW }, {}]
    );
    const ready = await readyItems(scopeOf(agent({ acceptsLarge: false })), 10);
    expect(ready.map((i) => i.id)).toEqual(["b", "c"]);
  });

  it("still offers large items to an agent without limits", async () => {
    queue(["a"], [{ large: true }]);
    const ready = await readyItems(scopeOf(agent(null)), 10);
    expect(ready.map((i) => i.id)).toEqual(["a"]);
  });
});

describe("who can change limits", () => {
  const owner: HubScope = {
    userId: "u1",
    workspaceId: "w1",
    actor: { kind: "owner" },
  };

  it("the owner sets and clears them", async () => {
    db.hubAgent.findFirst.mockResolvedValue(agent(null));
    db.hubAgent.update.mockImplementation(
      async (args: { data: { limits?: unknown } }) => ({
        ...agent(null),
        limits: args.data.limits,
      })
    );
    const set = await ownerUpdateAgent(owner, "grok", {
      limits: { maxInProgress: 2, maxClaimsPerDay: 6 },
    });
    expect(db.hubAgent.update.mock.calls[0][0].data.limits).toEqual({
      maxInProgress: 2,
      maxClaimsPerDay: 6,
    });
    expect(set.limits).toMatchObject({ maxInProgress: 2, maxClaimsPerDay: 6 });

    await ownerUpdateAgent(owner, "grok", { limits: null });
    expect(db.hubAgent.update.mock.calls[1][0].data).toHaveProperty("limits");

    // Left out: the stored limits stay.
    await ownerUpdateAgent(owner, "grok", { name: "Grok" });
    expect(db.hubAgent.update.mock.calls[2][0].data).not.toHaveProperty(
      "limits"
    );
  });

  it("an agent cannot change its own, even by sending the field", async () => {
    const self = agent({ maxInProgress: 2 });
    db.hubAgent.update.mockResolvedValue(self);
    await registerAgent(scopeOf(self), {
      name: "grok",
      skills: ["browser"],
      limits: null,
    } as never);
    const data = db.hubAgent.update.mock.calls[0]?.[0]?.data ?? {};
    expect(data).not.toHaveProperty("limits");
  });

  it("an agent is refused the owner edit", async () => {
    const self = agent({ maxInProgress: 2 });
    await expect(
      ownerUpdateAgent(scopeOf(self) as HubScope, "grok", { limits: null })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
