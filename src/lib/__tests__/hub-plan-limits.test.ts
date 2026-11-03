import { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";

import {
  canAddToHub,
  canUseHubAttachments,
  canUseHubRecurring,
  canUseHubWebhooks,
  hubHistoryDays,
} from "@/lib/entitlements";
import { PLAN_LIMITS } from "@/lib/plan-limits";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    hubAgent: { findMany: jest.fn() },
    hubItem: { count: jest.fn() },
    hubNote: { count: jest.fn() },
  },
}));

const db = prisma as unknown as {
  user: { findUnique: jest.Mock };
  hubAgent: { findMany: jest.Mock };
  hubItem: { count: jest.Mock };
  hubNote: { count: jest.Mock };
};

const future = new Date("2999-01-01");

function as(kind: "free" | "pro" | "lifetime" | "trial") {
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

/** `n` distinct active agent connections, as hubUsage reads them. */
function agents(n: number) {
  db.hubAgent.findMany.mockResolvedValue(
    Array.from({ length: n }, (_, index) => ({
      connectionKey: `token:${index}`,
    }))
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  agents(0);
  db.hubItem.count.mockResolvedValue(0);
  db.hubNote.count.mockResolvedValue(0);
});

describe("hub numbers in the plan table", () => {
  it("fixes Free at 2 agents, 30 open items, 100 notes, 7 days", () => {
    expect(PLAN_LIMITS.FREE).toMatchObject({
      hubAgents: 2,
      hubOpenItems: 30,
      hubNotes: 100,
      hubHistoryDays: 7,
      hubAttachments: false,
      hubWebhooks: false,
      hubRecurring: false,
    });
  });

  it("leaves Pro and Lifetime unlimited with 90 days", () => {
    for (const plan of [PLAN_LIMITS.PRO, PLAN_LIMITS.LIFETIME]) {
      expect(plan).toMatchObject({
        hubAgents: null,
        hubOpenItems: null,
        hubNotes: null,
        hubHistoryDays: 90,
        hubAttachments: true,
        hubWebhooks: true,
        hubRecurring: true,
      });
    }
  });
});

describe("canAddToHub", () => {
  it("blocks the 3rd agent on Free and allows the 2nd", async () => {
    as("free");
    agents(1);
    expect((await canAddToHub("u", "agents")).allowed).toBe(true);
    agents(2);
    const status = await canAddToHub("u", "agents");
    expect(status).toMatchObject({
      allowed: false,
      limit: 2,
      used: 2,
      upgradeRequired: true,
    });
  });

  it("blocks the 31st open item on Free", async () => {
    as("free");
    db.hubItem.count.mockResolvedValue(29);
    expect((await canAddToHub("u", "items")).allowed).toBe(true);
    db.hubItem.count.mockResolvedValue(30);
    expect((await canAddToHub("u", "items")).allowed).toBe(false);
  });

  it("refuses a plan whose steps do not fit, even when one item would", async () => {
    as("free");
    db.hubItem.count.mockResolvedValue(28);
    expect((await canAddToHub("u", "items", 2)).allowed).toBe(true);
    expect((await canAddToHub("u", "items", 3)).allowed).toBe(false);
  });

  it("blocks the 101st note on Free", async () => {
    as("free");
    db.hubNote.count.mockResolvedValue(100);
    expect((await canAddToHub("u", "notes")).allowed).toBe(false);
  });

  it("stays blocked, never an error, when data is already over the limit", async () => {
    as("free");
    agents(9);
    const status = await canAddToHub("u", "agents");
    expect(status).toMatchObject({ allowed: false, used: 9, remaining: 0 });
  });

  it.each(["pro", "lifetime", "trial"] as const)(
    "is unlimited on %s",
    async (kind) => {
      as(kind);
      agents(1000);
      db.hubItem.count.mockResolvedValue(1000);
      db.hubNote.count.mockResolvedValue(1000);
      for (const resource of ["agents", "items", "notes"] as const) {
        const status = await canAddToHub("u", resource, 5);
        expect(status).toMatchObject({ allowed: true, limit: null });
      }
    }
  );
});

describe("hubUsage where-clauses", () => {
  it("counts distinct connections per person, active only, without the assistant", async () => {
    as("free");
    agents(1);
    await canAddToHub("u", "agents");
    expect(db.hubAgent.findMany).toHaveBeenCalledWith({
      where: {
        userId: "u",
        disabledAt: null,
        NOT: { connectionKey: "assistant" },
      },
      distinct: ["connectionKey"],
      select: { connectionKey: true },
    });
  });

  it("counts open items per person, not done, failed or cancelled", async () => {
    as("free");
    await canAddToHub("u", "items");
    expect(db.hubItem.count).toHaveBeenCalledWith({
      where: {
        userId: "u",
        status: { notIn: ["done", "failed", "cancelled"] },
      },
    });
  });
});

describe("Pro-only hub features", () => {
  it("are false on Free and true on Pro, Lifetime and a trial", async () => {
    as("free");
    expect((await canUseHubAttachments("u")).allowed).toBe(false);
    expect((await canUseHubWebhooks("u")).allowed).toBe(false);
    expect((await canUseHubRecurring("u")).allowed).toBe(false);
    expect((await canUseHubWebhooks("u")).upgradeRequired).toBe(true);
    for (const kind of ["pro", "lifetime", "trial"] as const) {
      as(kind);
      expect((await canUseHubAttachments("u")).allowed).toBe(true);
      expect((await canUseHubWebhooks("u")).allowed).toBe(true);
      expect((await canUseHubRecurring("u")).allowed).toBe(true);
    }
  });
});

describe("hubHistoryDays", () => {
  it("is 7 on Free and 90 on every paid plan and trial", async () => {
    as("free");
    expect(await hubHistoryDays("u")).toBe(7);
    for (const kind of ["pro", "lifetime", "trial"] as const) {
      as(kind);
      expect(await hubHistoryDays("u")).toBe(90);
    }
  });
});
