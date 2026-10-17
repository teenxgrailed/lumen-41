import { NextRequest } from "next/server";

import { DELETE, PATCH } from "@/app/api/habits/[id]/route";
import { POST } from "@/app/api/habits/route";
import { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { PLAN_LIMITS } from "@/lib/plan-limits";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/auth/workspace-auth", () => ({
  workspaceDataScopeWhere: () => ({ workspaceId: "ws-1" }),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    habit: {
      count: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    workSchedule: { findFirst: jest.fn() },
  },
}));

const db = prisma as unknown as {
  user: { findUnique: jest.Mock };
  habit: {
    count: jest.Mock;
    create: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
  };
};

const FUTURE = new Date("2999-01-01T00:00:00.000Z");
const PAST = new Date("2000-01-01T00:00:00.000Z");

function onPlan(plan: SubscriptionPlan, options: { trialEndsAt?: Date } = {}) {
  db.user.findUnique.mockResolvedValue({
    subscription: {
      plan,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: FUTURE,
    },
    trialGrant: options.trialEndsAt ? { endsAt: options.trialEndsAt } : null,
  });
}

function withActiveHabits(count: number) {
  db.habit.count.mockResolvedValue(count);
}

const newHabit = {
  title: "Read",
  targetOccurrencesPerWeek: 3,
  estimatedMinutes: 20,
};

function defined(response: Response | undefined): Response {
  if (!response) throw new Error("Expected a route response.");
  return response;
}

async function post(body: unknown) {
  return defined(
    await POST(
      new NextRequest("http://localhost/api/habits", {
        method: "POST",
        body: JSON.stringify(body),
      })
    )
  );
}

async function patch(id: string, body: unknown) {
  return defined(
    await PATCH(
      new NextRequest(`http://localhost/api/habits/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id }) }
    )
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(authenticateRequest).mockResolvedValue({
    userId: "user-1",
    workspace: { workspaceId: "ws-1" },
  } as never);
  db.habit.create.mockImplementation(async ({ data }) => ({
    id: "habit-new",
    ...data,
  }));
  db.habit.update.mockImplementation(async ({ where, data }) => ({
    id: where.id,
    ...data,
  }));
});

describe("PLAN_LIMITS.habits", () => {
  it("is three on Free and unlimited on Pro and Lifetime", () => {
    expect(PLAN_LIMITS.FREE.habits).toBe(3);
    expect(PLAN_LIMITS.PRO.habits).toBeNull();
    expect(PLAN_LIMITS.LIFETIME.habits).toBeNull();
  });
});

describe("POST /api/habits", () => {
  it("lets Free create up to the third active habit", async () => {
    onPlan(SubscriptionPlan.FREE);
    withActiveHabits(2);

    const response = await post(newHabit);

    expect(response.status).toBe(201);
    expect(db.habit.count).toHaveBeenCalledWith({
      where: { userId: "user-1", archivedAt: null, isSample: false },
    });
  });

  it("refuses Free a fourth active habit with UPGRADE_REQUIRED", async () => {
    onPlan(SubscriptionPlan.FREE);
    withActiveHabits(3);

    const response = await post(newHabit);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "UPGRADE_REQUIRED",
      entitlement: {
        allowed: false,
        limit: 3,
        used: 3,
        remaining: 0,
        upgradeRequired: true,
        plan: SubscriptionPlan.FREE,
      },
    });
    expect(db.habit.create).not.toHaveBeenCalled();
  });

  it.each([
    ["Pro", SubscriptionPlan.PRO, {}],
    ["Lifetime", SubscriptionPlan.LIFETIME, {}],
    ["a trial", SubscriptionPlan.FREE, { trialEndsAt: FUTURE }],
  ] as const)("does not limit %s", async (_label, plan, options) => {
    onPlan(plan, options);
    withActiveHabits(40);

    const response = await post(newHabit);

    expect(response.status).toBe(201);
  });

  it("limits again once the trial is over", async () => {
    onPlan(SubscriptionPlan.FREE, { trialEndsAt: PAST });
    withActiveHabits(3);

    expect((await post(newHabit)).status).toBe(403);
  });
});

describe("PATCH /api/habits/[id] with { archived: false }", () => {
  it("restores an archived habit while Free is under the limit", async () => {
    onPlan(SubscriptionPlan.FREE);
    withActiveHabits(2);
    db.habit.findFirst.mockResolvedValue({ id: "habit-1" });

    const response = await patch("habit-1", { archived: false });

    expect(response.status).toBe(200);
    expect(db.habit.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "habit-1",
          userId: "user-1",
          archivedAt: { not: null },
        }),
      })
    );
    expect(db.habit.update).toHaveBeenCalledWith({
      where: { id: "habit-1" },
      data: { archivedAt: null, isActive: true },
    });
  });

  it("refuses to restore past Free's limit", async () => {
    onPlan(SubscriptionPlan.FREE);
    withActiveHabits(3);
    db.habit.findFirst.mockResolvedValue({ id: "habit-1" });

    const response = await patch("habit-1", { archived: false });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "UPGRADE_REQUIRED",
    });
    expect(db.habit.update).not.toHaveBeenCalled();
  });

  it("restores without a limit on Pro", async () => {
    onPlan(SubscriptionPlan.PRO);
    withActiveHabits(12);
    db.habit.findFirst.mockResolvedValue({ id: "habit-1" });

    expect((await patch("habit-1", { archived: false })).status).toBe(200);
  });

  it("answers 404 for a habit that is not archived or not the caller's", async () => {
    onPlan(SubscriptionPlan.PRO);
    db.habit.findFirst.mockResolvedValue(null);

    expect((await patch("habit-x", { archived: false })).status).toBe(404);
  });

  it("rejects a restore that carries other fields", async () => {
    onPlan(SubscriptionPlan.PRO);

    const response = await patch("habit-1", {
      archived: false,
      userId: "someone-else",
    });

    expect(response.status).toBe(400);
    expect(db.habit.update).not.toHaveBeenCalled();
  });
});

describe("after a downgrade to Free with more than three habits", () => {
  beforeEach(() => {
    onPlan(SubscriptionPlan.FREE);
    withActiveHabits(5);
  });

  it("keeps the existing habits editable", async () => {
    db.habit.findFirst.mockResolvedValue({ id: "habit-4" });

    const response = await patch("habit-4", { title: "Read more" });

    expect(response.status).toBe(200);
    expect(db.habit.update).toHaveBeenCalledWith({
      where: { id: "habit-4" },
      data: { title: "Read more" },
    });
    expect(db.habit.count).not.toHaveBeenCalled();
  });

  it("still lets one be archived", async () => {
    db.habit.findFirst.mockResolvedValue({ id: "habit-4" });

    const response = defined(
      await DELETE(
        new NextRequest("http://localhost/api/habits/habit-4", {
          method: "DELETE",
        }),
        { params: Promise.resolve({ id: "habit-4" }) }
      )
    );

    expect(response.status).toBe(204);
  });

  it("refuses a new one", async () => {
    expect((await post(newHabit)).status).toBe(403);
  });
});
