import { goalCheckInDrafts } from "../check-in";

const findMany = jest.fn();
jest.mock("@/lib/prisma", () => ({
  prisma: { goal: { findMany: (...args: unknown[]) => findMany(...args) } },
}));
jest.mock("@/lib/entitlements", () => ({ canUseGoals: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const entitlements = require("@/lib/entitlements");

const zone = "Europe/Zurich";
// Tuesday 2026-10-27 10:00 in Zurich.
const now = new Date("2026-10-27T09:00:00.000Z");

function goal(fields: Record<string, unknown>) {
  return {
    id: "g1",
    title: "Run 10k",
    checkInWeekday: 1,
    checkInHour: 9,
    lastCheckInAt: null,
    createdAt: new Date("2026-10-01T00:00:00.000Z"),
    ...fields,
  };
}

beforeEach(() => {
  findMany.mockReset();
  entitlements.canUseGoals.mockResolvedValue({ allowed: true, plan: "PRO" });
});

describe("goalCheckInDrafts", () => {
  it("asks once per week from the slot on, keyed by the slot's day", async () => {
    findMany.mockResolvedValue([goal({})]);
    const drafts = await goalCheckInDrafts("user-1", zone, now);
    expect(drafts).toEqual([
      {
        subject: "goal:g1",
        type: "GOAL_CHECKIN",
        timeWindow: "2026-10-26",
        title: "How's Run 10k?",
        body: "Update where it stands, or add a note.",
        deepLink: "/goals?goal=g1&checkin=1",
      },
    ]);
    expect(findMany.mock.calls[0][0].where).toMatchObject({
      userId: "user-1",
      status: "active",
      archivedAt: null,
      checkInEnabled: true,
    });
  });

  it("stays quiet when answered since the slot or made after it", async () => {
    findMany.mockResolvedValue([
      goal({ id: "answered", lastCheckInAt: new Date("2026-10-26T12:00:00Z") }),
      goal({ id: "new", createdAt: new Date("2026-10-26T09:00:00Z") }),
    ]);
    expect(await goalCheckInDrafts("user-1", zone, now)).toEqual([]);
  });

  it("asks nothing on Free", async () => {
    entitlements.canUseGoals.mockResolvedValue({
      allowed: false,
      plan: "FREE",
    });
    findMany.mockResolvedValue([goal({})]);
    expect(await goalCheckInDrafts("user-1", zone, now)).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});
