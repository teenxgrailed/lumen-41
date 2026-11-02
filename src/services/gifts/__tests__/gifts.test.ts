import { BillingGrantError } from "@/services/billing/manual-grant";

import {
  GiftError,
  cleanGiftNote,
  expireProGifts,
  grantGift,
  markGiftSeen,
} from "../gifts";

const findUnique = jest.fn();
const giftCreate = jest.fn();
const giftUpdateMany = jest.fn();
const grantManualPlan = jest.fn();
const recordAdminAudit = jest.fn();

const tx = { proGift: { create: (...a: unknown[]) => giftCreate(...a) } };

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => findUnique(...a) },
    proGift: { updateMany: (...a: unknown[]) => giftUpdateMany(...a) },
    $transaction: async (fn: (t: unknown) => unknown) => fn(tx),
  },
}));
jest.mock("@/services/admin/audit", () => ({
  recordAdminAudit: (...a: unknown[]) => recordAdminAudit(...a),
}));
jest.mock("@/services/billing/manual-grant", () => {
  class BillingGrantError extends Error {}
  return {
    BillingGrantError,
    grantManualPlan: (...a: unknown[]) => grantManualPlan(...a),
    revokeManualPlan: jest.fn(),
  };
});

const NOW = new Date("2026-11-03T10:00:00.000Z");
const ENDS = new Date("2026-12-03T10:00:00.000Z");

describe("cleanGiftNote", () => {
  it("returns null for nothing", () => {
    expect(cleanGiftNote(undefined)).toBeNull();
    expect(cleanGiftNote("   ")).toBeNull();
  });

  it("collapses whitespace", () => {
    expect(cleanGiftNote("  thank \n  you ")).toBe("thank you");
  });

  it("refuses more than 280 characters and markup", () => {
    expect(() => cleanGiftNote("x".repeat(281))).toThrow(GiftError);
    expect(cleanGiftNote("x".repeat(280))).toHaveLength(280);
    expect(() => cleanGiftNote("<b>hi</b>")).toThrow(GiftError);
  });
});

describe("grantGift", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findUnique.mockResolvedValue({
      id: "u1",
      email: "a@example.com",
      sandboxKind: null,
    });
    grantManualPlan.mockResolvedValue({ currentPeriodEnd: ENDS });
    giftCreate.mockResolvedValue({ id: "g1", endsAt: ENDS });
  });

  const input = { actorId: "admin", userId: "u1", months: 1, now: NOW };

  it("gives Pro through the comp mechanism and writes the ledger and audit", async () => {
    const gift = await grantGift({ ...input, note: "Thanks" });
    expect(gift).toEqual({ id: "g1", endsAt: ENDS });
    expect(grantManualPlan.mock.calls[0][1]).toMatchObject({
      userId: "u1",
      kind: "pro_days",
      days: 30,
    });
    expect(giftCreate.mock.calls[0][0].data).toMatchObject({
      userId: "u1",
      grantedBy: "admin",
      months: 1,
      personalNote: "Thanks",
      endsAt: ENDS,
    });
    expect(recordAdminAudit.mock.calls[0][0]).toMatchObject({
      action: "user.gift_pro",
      targetUserId: "u1",
    });
  });

  it.each([
    [1, 30],
    [3, 91],
    [12, 365],
  ])("%i months is %i days", async (months, days) => {
    await grantGift({ ...input, months });
    expect(grantManualPlan.mock.calls[0][1].days).toBe(days);
  });

  it("refuses a length that is not 1, 3 or 12 months", async () => {
    await expect(grantGift({ ...input, months: 2 })).rejects.toMatchObject({
      status: 400,
    });
    expect(grantManualPlan).not.toHaveBeenCalled();
  });

  it("refuses a missing account and a sandbox account", async () => {
    findUnique.mockResolvedValueOnce(null);
    await expect(grantGift(input)).rejects.toMatchObject({ status: 404 });
    findUnique.mockResolvedValueOnce({
      id: "u1",
      email: null,
      sandboxKind: "demo",
    });
    await expect(grantGift(input)).rejects.toMatchObject({ status: 409 });
  });

  it("refuses an account that already pays or has Lifetime", async () => {
    grantManualPlan.mockRejectedValueOnce(
      new BillingGrantError("PAID_SUBSCRIPTION", "Has a purchase")
    );
    await expect(grantGift(input)).rejects.toMatchObject({ status: 409 });
    grantManualPlan.mockResolvedValueOnce({ currentPeriodEnd: null });
    await expect(grantGift(input)).rejects.toMatchObject({ status: 409 });
    expect(giftCreate).not.toHaveBeenCalled();
  });

  it("refuses a bad note before touching the database", async () => {
    await expect(
      grantGift({ ...input, note: "<script>" })
    ).rejects.toBeInstanceOf(GiftError);
    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe("gift expiry and seen", () => {
  beforeEach(() => jest.clearAllMocks());

  it("stamps expiredAt on gifts whose end has passed, only once", async () => {
    giftUpdateMany.mockResolvedValue({ count: 2 });
    await expect(expireProGifts(NOW)).resolves.toBe(2);
    expect(giftUpdateMany.mock.calls[0][0]).toEqual({
      where: { expiredAt: null, endsAt: { lte: NOW } },
      data: { expiredAt: NOW },
    });
  });

  it("marks a gift seen only for its owner and only once", async () => {
    giftUpdateMany.mockResolvedValueOnce({ count: 1 });
    await expect(markGiftSeen("u1", "g1", NOW)).resolves.toBe(true);
    expect(giftUpdateMany.mock.calls[0][0].where).toEqual({
      id: "g1",
      userId: "u1",
      seenAt: null,
    });
    giftUpdateMany.mockResolvedValueOnce({ count: 0 });
    await expect(markGiftSeen("u2", "g1", NOW)).resolves.toBe(false);
  });
});
