import { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";

import { canAddCalendar } from "@/lib/entitlements";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    connectedAccount: { count: jest.fn(), findFirst: jest.fn() },
  },
}));

const db = prisma as unknown as {
  user: { findUnique: jest.Mock };
  connectedAccount: { count: jest.Mock; findFirst: jest.Mock };
};

beforeEach(() => {
  jest.clearAllMocks();
  db.user.findUnique.mockResolvedValue({
    subscription: {
      plan: SubscriptionPlan.FREE,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodEnd: new Date("2999-01-01"),
    },
    trialGrant: null,
  });
  db.connectedAccount.findFirst.mockResolvedValue(null);
});

describe("canAddCalendar", () => {
  it("counts only accounts that carry a calendar", async () => {
    db.connectedAccount.count.mockResolvedValue(0);
    const status = await canAddCalendar("u1");
    expect(db.connectedAccount.count).toHaveBeenCalledWith({
      where: { userId: "u1", calendars: { some: {} } },
    });
    expect(status.allowed).toBe(true);
  });

  it("blocks a second calendar account on Free", async () => {
    db.connectedAccount.count.mockResolvedValue(1);
    const status = await canAddCalendar("u1");
    expect(status.allowed).toBe(false);
    expect(status.upgradeRequired).toBe(true);
  });

  it("lets the same account be re-authorised at the cap", async () => {
    db.connectedAccount.count.mockResolvedValue(1);
    db.connectedAccount.findFirst.mockResolvedValue({ id: "acct-1" });
    const status = await canAddCalendar("u1", {
      provider: "GOOGLE",
      email: "me@example.com",
    });
    expect(db.connectedAccount.findFirst).toHaveBeenCalledWith({
      where: {
        userId: "u1",
        provider: "GOOGLE",
        email: "me@example.com",
        calendars: { some: {} },
      },
      select: { id: true },
    });
    expect(status.allowed).toBe(true);
    expect(status.upgradeRequired).toBe(false);
  });

  it("does not treat a Tasks-only row as a calendar reconnect", async () => {
    db.connectedAccount.count.mockResolvedValue(1);
    // The row for this address has no calendar feeds, so the query finds none.
    db.connectedAccount.findFirst.mockResolvedValue(null);
    const status = await canAddCalendar("u1", {
      provider: "GOOGLE",
      email: "tasks-only@example.com",
    });
    expect(status.allowed).toBe(false);
  });

  it("matches any account of the provider when the address is not yet known", async () => {
    db.connectedAccount.count.mockResolvedValue(1);
    await canAddCalendar("u1", { provider: "OUTLOOK" });
    expect(db.connectedAccount.findFirst).toHaveBeenCalledWith({
      where: {
        userId: "u1",
        provider: "OUTLOOK",
        calendars: { some: {} },
      },
      select: { id: true },
    });
  });
});
