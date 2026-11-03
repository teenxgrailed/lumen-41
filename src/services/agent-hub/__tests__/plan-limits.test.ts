/**
 * Hub plan limits (owner decision 2026-11-03): Free keeps 2 agents, 30 open
 * items, 100 notes and 7 days of history; Pro, Lifetime and a trial are
 * unlimited with 90 days. Over the limit a new create is refused with
 * PLAN_LIMIT; data already above the limit stays readable.
 */
import type { BearerAuth } from "@/services/connectors/bearer";
import { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { type HubScope, agentForConnection } from "../context";
import { HubError } from "../errors";
import { createItem } from "../items";
import { historySince } from "../limits";
import { writeNote } from "../notes";
import { createAgentToken } from "../tokens";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    hubAgent: { count: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
    hubItem: { count: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
    hubNote: { count: jest.fn(), create: jest.fn() },
    oAuthClient: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));
jest.mock("@/lib/feature-flags", () => ({ agentHubEnabled: jest.fn() }));

const db = prisma as unknown as {
  user: { findUnique: jest.Mock };
  hubAgent: { count: jest.Mock; findUnique: jest.Mock; create: jest.Mock };
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

beforeEach(() => {
  jest.resetAllMocks();
  plan("free");
  db.hubAgent.count.mockResolvedValue(0);
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
    db.hubAgent.count.mockResolvedValue(1);
    await expect(agentForConnection(personal, "ws1")).resolves.toBeTruthy();

    db.hubAgent.count.mockResolvedValue(2);
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
    expect(db.hubAgent.count).toHaveBeenCalledWith({
      where: {
        userId: "u1",
        disabledAt: null,
        NOT: { connectionKey: "assistant" },
      },
    });
  });

  it("refuses a 3rd agent token on Free and writes nothing", async () => {
    db.hubAgent.count.mockResolvedValue(2);
    const error = await refusal(() => createAgentToken(owner, { name: "Z" }));
    expect((error as HubError).code).toBe("PLAN_LIMIT");
    expect(db.hubAgent.create).not.toHaveBeenCalled();
  });

  it("keeps an agent that already exists above the limit working", async () => {
    db.hubAgent.count.mockResolvedValue(5);
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
      db.hubAgent.count.mockResolvedValue(500);
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
