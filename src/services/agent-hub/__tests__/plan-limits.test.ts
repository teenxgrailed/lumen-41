/**
 * Hub plan limits (owner decision 2026-11-03): Free keeps 2 agents, 30 open
 * items, 100 notes and 7 days of history; Pro, Lifetime and a trial are
 * unlimited with 90 days. Over the limit a new create is refused with
 * PLAN_LIMIT; data already above the limit stays readable.
 */
import type { BearerAuth } from "@/services/connectors/bearer";
import { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { ownerUpdateAgent } from "../agents";
import { type HubScope, agentForConnection } from "../context";
import { HubError } from "../errors";
import { createItem, latestEvents, ownerAnswer, viewOne } from "../items";
import { assertHubLimitFor, historySince, historyWindow } from "../limits";
import { writeNote } from "../notes";
import { createAgentToken, revokeAgentToken } from "../tokens";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    hubAgent: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    hubAgentToken: { findFirst: jest.fn(), update: jest.fn() },
    hubItemEvent: { findMany: jest.fn() },
    hubItemLink: { findMany: jest.fn() },
    hubItem: { count: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
    hubNote: { count: jest.fn(), create: jest.fn() },
    oAuthClient: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));
jest.mock("@/lib/feature-flags", () => ({ agentHubEnabled: jest.fn() }));

const db = prisma as unknown as {
  user: { findUnique: jest.Mock };
  hubAgent: {
    findMany: jest.Mock;
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  hubAgentToken: { findFirst: jest.Mock; update: jest.Mock };
  hubItemEvent: { findMany: jest.Mock };
  hubItemLink: { findMany: jest.Mock };
  hubItem: { count: jest.Mock; findFirst: jest.Mock; create: jest.Mock };
  hubNote: { count: jest.Mock; create: jest.Mock };
  $transaction: jest.Mock;
};

const future = new Date("2999-01-01");

function plan(kind: "free" | "pro" | "lifetime" | "trial") {
  db.user.findUnique.mockResolvedValue({
    subscription:
      kind === "pro" || kind === "lifetime"
        ? {
            plan:
              kind === "pro" ? SubscriptionPlan.PRO : SubscriptionPlan.LIFETIME,
            status: SubscriptionStatus.ACTIVE,
            currentPeriodEnd: future,
          }
        : null,
    trialGrant: kind === "trial" ? { endsAt: future } : null,
  });
}

const personal: BearerAuth = {
  userId: "u1",
  kind: "personal",
  scopes: ["needt.read", "needt.write"],
  personalTokenId: "tok-3",
  personalTokenName: "Third",
};

const owner: HubScope = {
  userId: "u1",
  workspaceId: "ws1",
  actor: { kind: "owner" },
};

async function refusal(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    return error;
  }
  return null;
}

/** `n` distinct active agent connections, as hubUsage reads them. */
function agents(n: number) {
  db.hubAgent.findMany.mockResolvedValue(
    Array.from({ length: n }, (_, index) => ({
      connectionKey: `token:${index}`,
    }))
  );
}

beforeEach(() => {
  jest.resetAllMocks();
  plan("free");
  agents(0);
  db.hubAgent.findFirst.mockResolvedValue(null);
  db.hubItem.count.mockResolvedValue(0);
  db.hubNote.count.mockResolvedValue(0);
  db.hubAgent.findUnique.mockResolvedValue(null);
  db.hubItem.findFirst.mockResolvedValue(null);
  db.hubAgent.create.mockImplementation(async ({ data }) => ({
    id: "a-new",
    ...data,
  }));
  db.hubNote.create.mockImplementation(async ({ data }) => ({
    id: "n1",
    createdAt: new Date(),
    updatedAt: new Date(),
    ownerEdited: false,
    ...data,
  }));
});

describe("agents", () => {
  it("lets Free register the 2nd agent and refuses the 3rd with PLAN_LIMIT", async () => {
    agents(1);
    await expect(agentForConnection(personal, "ws1")).resolves.toBeTruthy();

    agents(2);
    const error = await refusal(() => agentForConnection(personal, "ws1"));
    expect(error).toBeInstanceOf(HubError);
    const hub = error as HubError;
    expect(hub.code).toBe("PLAN_LIMIT");
    expect(hub.status).toBe(402);
    expect(hub.message).toContain("2 agents");
    expect(hub.message).toContain("Upgrade to Pro for unlimited agents");
    expect(hub.body()).toMatchObject({
      error: "PLAN_LIMIT",
      limit: 2,
      used: 2,
      resource: "agents",
    });
    expect(db.hubAgent.create).toHaveBeenCalledTimes(1);
  });

  it("counts only agents that are not disabled, and not the assistant", async () => {
    await agentForConnection(personal, "ws1");
    expect(db.hubAgent.findMany).toHaveBeenCalledWith({
      where: {
        userId: "u1",
        disabledAt: null,
        NOT: { connectionKey: "assistant" },
      },
      distinct: ["connectionKey"],
      select: { connectionKey: true },
    });
  });

  it("refuses a 3rd agent token on Free and writes nothing", async () => {
    agents(2);
    const error = await refusal(() => createAgentToken(owner, { name: "Z" }));
    expect((error as HubError).code).toBe("PLAN_LIMIT");
    expect(db.hubAgent.create).not.toHaveBeenCalled();
  });

  it("keeps an agent that already exists above the limit working", async () => {
    agents(5);
    db.hubAgent.findUnique.mockResolvedValue({
      id: "a-old",
      userId: "u1",
      workspaceId: "ws1",
      connectionKey: "token:tok-3",
      disabledAt: null,
      lastSeenAt: new Date(),
    });
    await expect(agentForConnection(personal, "ws1")).resolves.toMatchObject({
      id: "a-old",
    });
  });

  it.each(["pro", "lifetime", "trial"] as const)(
    "has no agent limit on %s",
    async (kind) => {
      plan(kind);
      agents(500);
      await expect(agentForConnection(personal, "ws1")).resolves.toBeTruthy();
    }
  );
});

describe("items", () => {
  const brief = {
    title: "Check the thing",
    goal: "Check the thing and report what you find back.",
    doneCriteria: "A short report exists",
    context: "Plenty of context so that the other agent can start right away.",
    risks: [],
    assignee: "any",
    requiredSkills: ["web"],
  };

  it("refuses the 31st open item on Free", async () => {
    db.hubItem.count.mockResolvedValue(30);
    const error = await refusal(() => createItem(owner, brief));
    expect((error as HubError).code).toBe("PLAN_LIMIT");
    expect((error as HubError).message).toContain("30 open hub items");
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("counts only items that are not done, failed or cancelled", async () => {
    db.hubItem.count.mockResolvedValue(30);
    await refusal(() => createItem(owner, brief));
    expect(db.hubItem.count).toHaveBeenCalledWith({
      where: {
        userId: "u1",
        status: { notIn: ["done", "failed", "cancelled"] },
      },
    });
  });

  it.each(["pro", "lifetime", "trial"] as const)(
    "has no item limit on %s",
    async (kind) => {
      plan(kind);
      db.hubItem.count.mockResolvedValue(10_000);
      // Past the limit check createItem opens its transaction; reaching it
      // proves the limit let the create through.
      db.$transaction.mockRejectedValue(new Error("reached the write"));
      const error = await refusal(() => createItem(owner, brief));
      expect((error as Error).message).toBe("reached the write");
    }
  );
});

describe("memory notes", () => {
  it("refuses the 101st note on Free", async () => {
    db.hubNote.count.mockResolvedValue(100);
    const error = await refusal(() => writeNote(owner, { text: "hello" }));
    expect((error as HubError).code).toBe("PLAN_LIMIT");
    expect((error as HubError).message).toContain("100 memory notes");
    expect(db.hubNote.create).not.toHaveBeenCalled();
  });

  it("writes the 100th note", async () => {
    db.hubNote.count.mockResolvedValue(99);
    await writeNote(owner, { text: "hello" }).catch(() => undefined);
    expect(db.hubNote.create).toHaveBeenCalledTimes(1);
  });
});

describe("history", () => {
  const day = 24 * 60 * 60 * 1000;

  it("shows 7 days on Free and 90 on Pro, trial and Lifetime", async () => {
    for (const [kind, days] of [
      ["free", 7],
      ["pro", 90],
      ["lifetime", 90],
      ["trial", 90],
    ] as const) {
      plan(kind);
      const since = await historySince("u1");
      expect(Math.round((Date.now() - since.getTime()) / day)).toBe(days);
    }
  });
});

const day = 24 * 60 * 60 * 1000;
const disabledAgent = {
  id: "a-off",
  userId: "u1",
  workspaceId: "ws1",
  connectionKey: "token:off",
  disabledAt: new Date(),
};

describe("re-enabling an agent (M1)", () => {
  it("refuses on Free when the slots are full, and writes nothing", async () => {
    agents(2);
    db.hubAgent.findFirst.mockResolvedValue(disabledAgent);
    const error = await refusal(() =>
      ownerUpdateAgent(owner, "a-off", { disabled: false })
    );
    expect((error as HubError).code).toBe("PLAN_LIMIT");
    expect(db.hubAgent.update).not.toHaveBeenCalled();
  });

  it("re-enables when a slot is free", async () => {
    agents(1);
    db.hubAgent.findFirst.mockResolvedValue(disabledAgent);
    db.hubAgent.update.mockResolvedValue({
      ...disabledAgent,
      disabledAt: null,
    });
    await ownerUpdateAgent(owner, "a-off", { disabled: false });
    expect(db.hubAgent.update).toHaveBeenCalledTimes(1);
  });

  it("does not gate disabling, an already enabled agent or the assistant", async () => {
    agents(2);
    db.hubAgent.update.mockResolvedValue(disabledAgent);
    db.hubAgent.findFirst.mockResolvedValue({
      ...disabledAgent,
      disabledAt: null,
    });
    await ownerUpdateAgent(owner, "a-off", { disabled: true });
    await ownerUpdateAgent(owner, "a-off", { disabled: false });
    db.hubAgent.findFirst.mockResolvedValue({
      ...disabledAgent,
      connectionKey: "assistant",
    });
    await ownerUpdateAgent(owner, "a-off", { disabled: false });
    expect(db.hubAgent.update).toHaveBeenCalledTimes(3);
  });
});

describe("revoking a token (M2)", () => {
  it("disables the agent in the same transaction", async () => {
    db.hubAgentToken.findFirst.mockResolvedValue({ id: "t1", revokedAt: null });
    db.hubAgentToken.update.mockReturnValue("token-update");
    db.hubAgent.updateMany.mockReturnValue("agent-update");
    db.$transaction.mockResolvedValue([]);
    await revokeAgentToken(owner, "a1");
    expect(db.$transaction).toHaveBeenCalledWith([
      "token-update",
      "agent-update",
    ]);
    expect(db.hubAgentToken.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: { revokedAt: expect.any(Date) },
    });
    expect(db.hubAgent.updateMany).toHaveBeenCalledWith({
      where: { id: "a1", disabledAt: null },
      data: { disabledAt: expect.any(Date) },
    });
  });

  it("still frees the slot of an already revoked token whose agent is on", async () => {
    db.hubAgentToken.findFirst.mockResolvedValue({
      id: "t1",
      revokedAt: new Date(),
    });
    db.hubAgent.updateMany.mockReturnValue("agent-update");
    db.$transaction.mockResolvedValue([]);
    await revokeAgentToken(owner, "a1");
    expect(db.hubAgentToken.update).not.toHaveBeenCalled();
    expect(db.$transaction).toHaveBeenCalledWith(["agent-update"]);
  });
});

describe("reopening (M3)", () => {
  it("has no path from done, failed or cancelled back to open; the owner answer starts from needs_owner, already counted, so it is not gated", async () => {
    db.hubItem.count.mockResolvedValue(30);
    db.$transaction.mockRejectedValue(new Error("reached the write"));
    const error = await refusal(() => ownerAnswer(owner, "i1", "go on"));
    expect((error as Error).message).toBe("reached the write");
    expect(db.hubItem.count).not.toHaveBeenCalled();
  });
});

describe("one connection in two workspaces (M4)", () => {
  it("is one agent: the second workspace takes no new slot", async () => {
    agents(2);
    db.hubAgent.findFirst.mockResolvedValue({ id: "a-ws1" });
    await expect(agentForConnection(personal, "ws2")).resolves.toBeTruthy();
    expect(db.hubAgent.findFirst).toHaveBeenCalledWith({
      where: { userId: "u1", connectionKey: "token:tok-3", disabledAt: null },
      select: { id: true },
    });
    expect(db.hubAgent.create).toHaveBeenCalledTimes(1);
  });

  it("still refuses a genuinely new connection when full", async () => {
    agents(2);
    const error = await refusal(() => agentForConnection(personal, "ws2"));
    expect((error as HubError).code).toBe("PLAN_LIMIT");
  });
});

describe("the Needt assistant is never blocked (M5)", () => {
  const baseAgent = {
    id: "a-ask",
    userId: "u1",
    workspaceId: "ws1",
    name: "Needt assistant",
    kind: "other",
    capabilities: "",
    skills: [],
    disabledAt: null,
    lastSeenAt: new Date(),
  };
  const assistant: HubScope = {
    userId: "u1",
    workspaceId: "ws1",
    actor: {
      kind: "agent",
      agent: { ...baseAgent, connectionKey: "assistant" } as never,
    },
  };
  const other: HubScope = {
    ...assistant,
    actor: {
      kind: "agent",
      agent: { ...baseAgent, connectionKey: "token:x" } as never,
    },
  };

  it("skips the check for the assistant and keeps it for other agents and the owner", async () => {
    db.hubItem.count.mockResolvedValue(30);
    db.hubNote.count.mockResolvedValue(100);
    await expect(
      assertHubLimitFor("u1", assistant.actor, "items", 5)
    ).resolves.toBeUndefined();
    await expect(
      assertHubLimitFor("u1", assistant.actor, "notes")
    ).resolves.toBeUndefined();
    for (const actor of [other.actor, owner.actor]) {
      const error = await refusal(() =>
        assertHubLimitFor("u1", actor, "items")
      );
      expect((error as HubError).code).toBe("PLAN_LIMIT");
    }
  });

  it("lets the assistant create an item on a full account", async () => {
    db.hubItem.count.mockResolvedValue(30);
    db.$transaction.mockRejectedValue(new Error("reached the write"));
    const error = await refusal(() =>
      createItem(assistant, {
        title: "Check the thing",
        goal: "Check the thing and report what you find back.",
        doneCriteria: "A short report exists",
        context:
          "Plenty of context so that the other agent can start right away.",
        risks: [],
        assignee: "any",
        requiredSkills: ["web"],
      })
    );
    expect(error).not.toBeInstanceOf(HubError);
    expect(db.hubItem.count).not.toHaveBeenCalled();
  });

  it("lets the assistant write a note on a full account", async () => {
    db.hubNote.count.mockResolvedValue(100);
    await writeNote(assistant, { text: "hello" }).catch(() => undefined);
    expect(db.hubNote.create).toHaveBeenCalledTimes(1);
  });
});

describe("history window (L1, L2)", () => {
  it("resolves the plan once for any number of views when the window is passed", async () => {
    const item = {
      id: "i1",
      userId: "u1",
      workspaceId: "ws1",
      status: "done",
      links: [],
      risks: [],
      approvals: {},
      requiredSkills: [],
      criteriaItems: [],
      creatorKind: "owner",
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 1,
    };
    db.hubItemEvent.findMany.mockResolvedValue([]);
    db.hubItemLink.findMany.mockResolvedValue([]);
    const window = await historyWindow("u1");
    db.user.findUnique.mockClear();
    for (let step = 0; step < 4; step++) {
      await viewOne({ userId: "u1", workspaceId: "ws1" }, item as never, {
        recent: 3,
        window,
      });
    }
    expect(db.user.findUnique).not.toHaveBeenCalled();
    await viewOne({ userId: "u1", workspaceId: "ws1" }, item as never, {
      recent: 3,
    });
    expect(db.user.findUnique).toHaveBeenCalledTimes(1);
  });

  const old = {
    id: "e1",
    itemId: "i1",
    at: new Date(Date.now() - 30 * day),
  };

  it("on Free, an open item older than the window keeps its single latest event", async () => {
    const since = new Date(Date.now() - 7 * day);
    db.hubItemEvent.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([old]);
    const found = await latestEvents(["i1"], since, ["i1"]);
    expect(found.get("i1")).toBe(old);
    expect(db.hubItemEvent.findMany).toHaveBeenLastCalledWith({
      where: { itemId: { in: ["i1"] } },
      orderBy: [{ at: "desc" }],
      distinct: ["itemId"],
    });
  });

  it("does not look past the window for a finished item or when nothing is kept", async () => {
    const since = new Date(Date.now() - 7 * day);
    db.hubItemEvent.findMany.mockResolvedValue([]);
    const found = await latestEvents(["i1"], since, []);
    expect(found.size).toBe(0);
    expect(db.hubItemEvent.findMany).toHaveBeenCalledTimes(1);
  });

  it("marks only Free as limited", async () => {
    expect((await historyWindow("u1")).limited).toBe(true);
    plan("pro");
    expect((await historyWindow("u1")).limited).toBe(false);
  });
});
