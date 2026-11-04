import { NextRequest } from "next/server";

import { PATCH as patchEventRaw } from "@/app/api/habits/[id]/events/[eventId]/route";
import {
  GET as getEventsRaw,
  POST as postEventRaw,
} from "@/app/api/habits/[id]/events/route";
import { GET as getSummaryRaw } from "@/app/api/habits/[id]/quit-summary/route";
import { PATCH as PatchRaw } from "@/app/api/habits/[id]/route";
import { POST as PostRaw, GET as listHabitsRaw } from "@/app/api/habits/route";
import { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

/** Route handlers are typed `Response | undefined`; a test wants a Response. */
function wrap<A extends unknown[]>(
  handler: (...args: A) => Promise<Response | undefined>
) {
  return async (...args: A): Promise<Response> => {
    const response = await handler(...args);
    if (!response) throw new Error("Expected a route response.");
    return response;
  };
}
const getEvents = wrap(getEventsRaw);
const postEvent = wrap(postEventRaw);
const getSummary = wrap(getSummaryRaw);
const patchEvent = wrap(patchEventRaw);
const PATCH = wrap(PatchRaw);
const listHabits = wrap(listHabitsRaw);
const POST = wrap(PostRaw);

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/auth/workspace-auth", () => ({
  workspaceDataScopeWhere: () => ({ workspaceId: "ws-1" }),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    featureFlag: { findUnique: jest.fn() },
    userSettings: { findUnique: jest.fn() },
    habit: {
      count: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    habitEvent: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    workSchedule: { findFirst: jest.fn() },
    $transaction: jest.fn(),
    $executeRaw: jest.fn(),
  },
}));

const db = prisma as unknown as {
  $transaction: jest.Mock;
  user: { findUnique: jest.Mock };
  featureFlag: { findUnique: jest.Mock };
  userSettings: { findUnique: jest.Mock };
  habit: {
    count: jest.Mock;
    create: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
  };
  habitEvent: {
    create: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
  };
};

const FUTURE = new Date("2999-01-01T00:00:00.000Z");

function onPlan(plan: SubscriptionPlan, trialEndsAt?: Date) {
  db.user.findUnique.mockResolvedValue({
    subscription: {
      plan,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: FUTURE,
    },
    trialGrant: trialEndsAt ? { endsAt: trialEndsAt } : null,
  });
}

function flag(on: boolean) {
  db.featureFlag.findUnique.mockResolvedValue(
    on ? { enabled: true, rolloutPercentage: 100, overrides: [] } : null
  );
}

const ctx = (id = "habit-1") => ({ params: Promise.resolve({ id }) });

function req(
  method: string,
  body?: unknown,
  url = "http://localhost/api/habits"
) {
  return new NextRequest(url, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const quitHabit = {
  title: "No sugar",
  targetOccurrencesPerWeek: 1,
  estimatedMinutes: 5,
  kind: "QUIT",
  reason: "I want to sleep better",
};

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(authenticateRequest).mockResolvedValue({
    userId: "user-1",
    workspace: { workspaceId: "ws-1" },
  } as never);
  db.$transaction.mockImplementation(async (run: (tx: unknown) => unknown) =>
    run(prisma)
  );
  db.habit.count.mockResolvedValue(0);
  db.userSettings.findUnique.mockResolvedValue({ timeZone: "UTC" });
});

describe("POST /api/habits with kind QUIT", () => {
  it("answers 403 UPGRADE_REQUIRED on Free", async () => {
    flag(true);
    onPlan(SubscriptionPlan.FREE);
    const response = await POST(req("POST", quitHabit));
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error).toBe("UPGRADE_REQUIRED");
    expect(body.entitlement).toMatchObject({
      feature: "quitHabits",
      plan: "FREE",
    });
    expect(db.habit.create).not.toHaveBeenCalled();
  });

  it("answers 404 when the flag is off, even on Pro", async () => {
    flag(false);
    onPlan(SubscriptionPlan.PRO);
    expect((await POST(req("POST", quitHabit))).status).toBe(404);
    expect(db.habit.create).not.toHaveBeenCalled();
  });

  it("creates the habit on Pro and starts the quit now when no date is given", async () => {
    flag(true);
    onPlan(SubscriptionPlan.PRO);
    db.habit.create.mockResolvedValue({ id: "habit-1" });
    const response = await POST(req("POST", quitHabit));
    expect(response.status).toBe(201);
    const data = db.habit.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      kind: "QUIT",
      reason: "I want to sleep better",
      userId: "user-1",
      workspaceId: "ws-1",
    });
    expect(data.quitStartedAt).toBeInstanceOf(Date);
  });

  it("lets a trial create one", async () => {
    flag(true);
    onPlan(SubscriptionPlan.FREE, FUTURE);
    db.habit.create.mockResolvedValue({ id: "habit-1" });
    expect((await POST(req("POST", quitHabit))).status).toBe(201);
  });

  it("keeps the given quit date", async () => {
    flag(true);
    onPlan(SubscriptionPlan.LIFETIME);
    db.habit.create.mockResolvedValue({ id: "habit-1" });
    await POST(
      req("POST", { ...quitHabit, quitStartedAt: "2026-10-01T08:00:00Z" })
    );
    expect(db.habit.create.mock.calls[0][0].data.quitStartedAt).toEqual(
      new Date("2026-10-01T08:00:00Z")
    );
  });

  it("refuses a quit date far in the future", async () => {
    flag(true);
    onPlan(SubscriptionPlan.PRO);
    const response = await POST(
      req("POST", { ...quitHabit, quitStartedAt: "2999-01-01T00:00:00Z" })
    );
    expect(response.status).toBe(400);
  });

  it("refuses quit fields on a build habit", async () => {
    flag(true);
    onPlan(SubscriptionPlan.PRO);
    const response = await POST(req("POST", { ...quitHabit, kind: "BUILD" }));
    expect(response.status).toBe(400);
  });

  it("does not touch the gate for an ordinary habit", async () => {
    flag(false);
    onPlan(SubscriptionPlan.FREE);
    db.habit.create.mockResolvedValue({ id: "habit-1" });
    const response = await POST(
      req("POST", {
        title: "Read",
        targetOccurrencesPerWeek: 3,
        estimatedMinutes: 20,
      })
    );
    expect(response.status).toBe(201);
    expect(db.habit.create.mock.calls[0][0].data.kind).toBe("BUILD");
  });
});

describe("GET /api/habits quit state", () => {
  const get = () => listHabits(req("GET"));

  it.each([
    [false, SubscriptionPlan.PRO, "off"],
    [false, SubscriptionPlan.FREE, "off"],
    [true, SubscriptionPlan.FREE, "upgrade"],
    [true, SubscriptionPlan.PRO, "on"],
    [true, SubscriptionPlan.LIFETIME, "on"],
  ])("flag %s on %s is %s", async (on, plan, expected) => {
    db.habit.findMany.mockResolvedValue([]);
    flag(on);
    onPlan(plan);
    expect((await (await get()).json()).quit).toBe(expected);
  });

  it("a trial is on", async () => {
    db.habit.findMany.mockResolvedValue([]);
    flag(true);
    onPlan(SubscriptionPlan.FREE, FUTURE);
    expect((await (await get()).json()).quit).toBe("on");
  });
});

describe("PATCH /api/habits/:id/events/:eventId", () => {
  const patchE = (body: unknown) =>
    patchEvent(
      req("PATCH", body, "http://localhost/api/habits/habit-1/events/ev-1"),
      { params: Promise.resolve({ id: "habit-1", eventId: "ev-1" }) }
    );

  it("answers 403 on Free and 404 with the flag off", async () => {
    flag(true);
    onPlan(SubscriptionPlan.FREE);
    expect((await patchE({ tag: "x" })).status).toBe(403);
    flag(false);
    onPlan(SubscriptionPlan.PRO);
    expect((await patchE({ tag: "x" })).status).toBe(404);
    expect(db.habitEvent.update).not.toHaveBeenCalled();
  });

  it("writes tag, intensity and note onto the person's own event", async () => {
    flag(true);
    onPlan(SubscriptionPlan.PRO);
    db.habit.findFirst.mockResolvedValue({ id: "habit-1" });
    db.habitEvent.findFirst.mockResolvedValue({ id: "ev-1" });
    db.habitEvent.update.mockResolvedValue({ id: "ev-1", type: "URGE" });
    const response = await patchE({ tag: "stress", intensity: 4, note: "x" });
    expect(response.status).toBe(200);
    expect(db.habitEvent.findFirst.mock.calls[0][0].where).toEqual({
      id: "ev-1",
      habitId: "habit-1",
      userId: "user-1",
    });
    expect(db.habitEvent.update.mock.calls[0][0].data).toEqual({
      tag: "stress",
      intensity: 4,
      note: "x",
    });
  });

  it("refuses type, time, bad intensity and an empty body", async () => {
    flag(true);
    onPlan(SubscriptionPlan.PRO);
    for (const body of [
      { type: "RELAPSE" },
      { at: "2026-01-01T00:00:00Z" },
      { intensity: 6 },
      {},
    ]) {
      expect((await patchE(body)).status).toBe(400);
    }
    expect(db.habitEvent.update).not.toHaveBeenCalled();
  });

  it("404s someone else's event", async () => {
    flag(true);
    onPlan(SubscriptionPlan.PRO);
    db.habit.findFirst.mockResolvedValue({ id: "habit-1" });
    db.habitEvent.findFirst.mockResolvedValue(null);
    expect((await patchE({ tag: "x" })).status).toBe(404);
    expect(db.habitEvent.update).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/habits/:id", () => {
  const patch = (body: unknown) =>
    PATCH(req("PATCH", body, "http://localhost/api/habits/habit-1"), ctx());

  it("turning a build habit into a quit habit needs Pro", async () => {
    flag(true);
    onPlan(SubscriptionPlan.FREE);
    db.habit.findFirst.mockResolvedValue({ id: "habit-1", kind: "BUILD" });
    expect((await patch({ kind: "QUIT" })).status).toBe(403);
    expect(db.habit.update).not.toHaveBeenCalled();
  });

  it("sets a quit date when a build habit becomes a quit habit on Pro", async () => {
    flag(true);
    onPlan(SubscriptionPlan.PRO);
    db.habit.findFirst.mockResolvedValue({ id: "habit-1", kind: "BUILD" });
    db.habit.update.mockResolvedValue({ id: "habit-1" });
    expect((await patch({ kind: "QUIT" })).status).toBe(200);
    expect(db.habit.update.mock.calls[0][0].data.quitStartedAt).toBeInstanceOf(
      Date
    );
  });

  it("editing another field of a quit habit does not need the gate", async () => {
    flag(false);
    onPlan(SubscriptionPlan.FREE);
    db.habit.findFirst.mockResolvedValue({ id: "habit-1", kind: "QUIT" });
    db.habit.update.mockResolvedValue({ id: "habit-1" });
    expect((await patch({ title: "No sweets" })).status).toBe(200);
  });

  it("changing the reason of a quit habit does", async () => {
    flag(true);
    onPlan(SubscriptionPlan.FREE);
    db.habit.findFirst.mockResolvedValue({ id: "habit-1", kind: "QUIT" });
    expect((await patch({ reason: "new" })).status).toBe(403);
  });

  it("a quit habit never turns back into a build habit", async () => {
    flag(true);
    onPlan(SubscriptionPlan.PRO);
    db.habit.findFirst.mockResolvedValue({ id: "habit-1", kind: "QUIT" });
    expect((await patch({ kind: "BUILD" })).status).toBe(400);
  });

  it("refuses a reason on a build habit", async () => {
    flag(true);
    onPlan(SubscriptionPlan.PRO);
    db.habit.findFirst.mockResolvedValue({ id: "habit-1", kind: "BUILD" });
    expect((await patch({ reason: "x" })).status).toBe(400);
  });
});

describe("POST /api/habits/:id/events", () => {
  const post = (body: unknown) =>
    postEvent(
      req("POST", body, "http://localhost/api/habits/habit-1/events"),
      ctx()
    );
  const quit = { id: "habit-1", quitStartedAt: new Date(), title: "x" };

  it("answers 403 on Free and writes nothing", async () => {
    flag(true);
    onPlan(SubscriptionPlan.FREE);
    expect((await post({ type: "URGE" })).status).toBe(403);
    expect(db.habitEvent.create).not.toHaveBeenCalled();
  });

  it("answers 404 with the flag off", async () => {
    flag(false);
    onPlan(SubscriptionPlan.PRO);
    expect((await post({ type: "URGE" })).status).toBe(404);
    expect(db.habitEvent.create).not.toHaveBeenCalled();
  });

  it("logs an urge with tag and intensity on Pro", async () => {
    flag(true);
    onPlan(SubscriptionPlan.PRO);
    db.habit.findFirst.mockResolvedValue(quit);
    db.habitEvent.create.mockImplementation(async ({ data }) => ({
      id: "ev-1",
      ...data,
    }));
    const response = await post({ type: "URGE", tag: "stress", intensity: 4 });
    expect(response.status).toBe(201);
    expect(db.habit.findFirst.mock.calls[0][0].where).toMatchObject({
      id: "habit-1",
      userId: "user-1",
      kind: "QUIT",
    });
    expect(db.habitEvent.create.mock.calls[0][0].data).toMatchObject({
      habitId: "habit-1",
      userId: "user-1",
      type: "URGE",
      tag: "stress",
      intensity: 4,
    });
  });

  it("404s a habit that is not the person's quit habit", async () => {
    flag(true);
    onPlan(SubscriptionPlan.PRO);
    db.habit.findFirst.mockResolvedValue(null);
    expect((await post({ type: "RELAPSE" })).status).toBe(404);
    expect(db.habitEvent.create).not.toHaveBeenCalled();
  });

  it("refuses an event in the future and bad input", async () => {
    flag(true);
    onPlan(SubscriptionPlan.PRO);
    db.habit.findFirst.mockResolvedValue(quit);
    expect(
      (await post({ type: "URGE", at: "2999-01-01T00:00:00Z" })).status
    ).toBe(400);
    expect((await post({ type: "URGE", intensity: 9 })).status).toBe(400);
    expect((await post({ type: "NOPE" })).status).toBe(400);
    expect(db.habitEvent.create).not.toHaveBeenCalled();
  });
});

describe("GET /api/habits/:id/events", () => {
  const get = (query = "") =>
    getEvents(
      req(
        "GET",
        undefined,
        `http://localhost/api/habits/habit-1/events${query}`
      ),
      ctx()
    );

  it("stays readable on Free (a downgrade keeps the history)", async () => {
    flag(true);
    onPlan(SubscriptionPlan.FREE);
    db.habit.findFirst.mockResolvedValue({ id: "habit-1" });
    db.habitEvent.findMany.mockResolvedValue([]);
    expect((await get()).status).toBe(200);
  });

  it("answers 404 with the flag off", async () => {
    flag(false);
    onPlan(SubscriptionPlan.PRO);
    expect((await get()).status).toBe(404);
  });

  it("pages with nextBefore", async () => {
    flag(true);
    onPlan(SubscriptionPlan.PRO);
    db.habit.findFirst.mockResolvedValue({ id: "habit-1" });
    db.habitEvent.findMany.mockResolvedValue([
      { id: "a", at: new Date("2026-11-03T10:00:00Z") },
      { id: "b", at: new Date("2026-11-02T10:00:00Z") },
    ]);
    const body = await (await get("?limit=1&type=URGE")).json();
    expect(body.events).toHaveLength(1);
    expect(body.nextBefore).toBe("2026-11-03T10:00:00.000Z");
    expect(db.habitEvent.findMany.mock.calls[0][0]).toMatchObject({
      take: 2,
      where: { type: "URGE", habitId: "habit-1" },
    });
  });

  it("refuses a bad query", async () => {
    flag(true);
    onPlan(SubscriptionPlan.PRO);
    expect((await get("?limit=0")).status).toBe(400);
  });
});

describe("GET /api/habits/:id/quit-summary", () => {
  const get = () =>
    getSummary(
      req("GET", undefined, "http://localhost/api/habits/habit-1/quit-summary"),
      ctx()
    );

  it("stays readable on Free and 404s with the flag off", async () => {
    flag(true);
    onPlan(SubscriptionPlan.FREE);
    db.habit.findFirst.mockResolvedValue(null);
    expect((await get()).status).toBe(404); // not found, not 403
    expect(db.habit.findFirst).toHaveBeenCalled();
    flag(false);
    onPlan(SubscriptionPlan.PRO);
    expect((await get()).status).toBe(404);
  });

  it("returns the streak after a relapse", async () => {
    flag(true);
    onPlan(SubscriptionPlan.PRO);
    jest.useFakeTimers().setSystemTime(new Date("2026-11-04T10:00:00Z"));
    try {
      db.habit.findFirst.mockResolvedValue({
        id: "habit-1",
        quitStartedAt: new Date("2026-10-20T08:00:00Z"),
        title: "x",
      });
      db.habitEvent.findMany.mockResolvedValue([
        { type: "URGE", at: new Date("2026-10-25T22:30:00Z"), tag: "stress" },
        { type: "RELAPSE", at: new Date("2026-10-30T09:00:00Z"), tag: null },
      ]);
      const body = await (await get()).json();
      expect(body.summary).toMatchObject({
        habitId: "habit-1",
        currentStreak: 5,
        bestStreak: 10,
        totalCleanDays: 15,
        nextMilestone: { days: 7, daysLeft: 2 },
        timeZone: "UTC",
        counts: { URGE: 1, RELAPSE: 1 },
      });
      expect(body.summary.urges.byHour[22]).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it("404s a habit that is not a quit habit", async () => {
    flag(true);
    onPlan(SubscriptionPlan.PRO);
    db.habit.findFirst.mockResolvedValue(null);
    expect((await get()).status).toBe(404);
  });
});
