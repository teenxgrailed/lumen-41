import { grantManualPlan } from "@/services/billing/manual-grant";
import { extendTrialDays } from "@/services/billing/trial-extension";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { PromoError, redeemPromoCode } from "../redeem";

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/services/billing/manual-grant", () => {
  const actual = jest.requireActual("@/services/billing/manual-grant");
  return { ...actual, grantManualPlan: jest.fn() };
});
jest.mock("@/services/billing/trial-extension", () => {
  const actual = jest.requireActual("@/services/billing/trial-extension");
  return { ...actual, extendTrialDays: jest.fn() };
});
jest.mock("@/lib/prisma", () => ({
  prisma: { $transaction: jest.fn() },
}));

const future = new Date(Date.now() + 30 * 86_400_000);
const past = new Date(Date.now() - 86_400_000);

type PromoRow = {
  id: string;
  code: string;
  kind: string;
  value: number | null;
  maxRedemptions: number | null;
  redeemedCount: number;
  expiresAt: Date | null;
  active: boolean;
};

/**
 * A small in-memory stand-in for the three tables the redeem touches. The
 * conditional `updateMany` is evaluated the way the database does: the
 * `redeemedCount < max` test and the increment are one step.
 */
function world(
  promo: PromoRow | null,
  redemptions: Array<[string, string]> = []
) {
  const seen = new Set(redemptions.map(([u, c]) => `${u}:${c}`));
  const tx = {
    promoCode: {
      findUnique: jest.fn(async () => promo),
      updateMany: jest.fn(async ({ where, data }) => {
        if (!promo || where.id !== promo.id) return { count: 0 };
        if (where.active && !promo.active) return { count: 0 };
        const lt = where.redeemedCount?.lt;
        if (lt !== undefined && !(promo.redeemedCount < lt)) {
          return { count: 0 };
        }
        promo.redeemedCount += data.redeemedCount.increment;
        return { count: 1 };
      }),
    },
    promoRedemption: {
      findUnique: jest.fn(async ({ where }) =>
        seen.has(`${where.userId_codeId.userId}:${where.userId_codeId.codeId}`)
          ? { id: "r" }
          : null
      ),
      create: jest.fn(async ({ data }) => {
        seen.add(`${data.userId}:${data.codeId}`);
        return { id: "r" };
      }),
    },
    user: { findUnique: jest.fn(async () => ({ email: "pat@example.com" })) },
  };
  (prisma.$transaction as jest.Mock).mockImplementation(async (fn) => {
    // A thrown error rolls back only what this transaction wrote.
    const ownIncrements: number[] = [];
    const ownKeys: string[] = [];
    const scoped = {
      ...tx,
      promoCode: {
        ...tx.promoCode,
        updateMany: jest.fn(async (args) => {
          const out = await tx.promoCode.updateMany(args);
          if (out.count === 1)
            ownIncrements.push(args.data.redeemedCount.increment);
          return out;
        }),
      },
      promoRedemption: {
        ...tx.promoRedemption,
        create: jest.fn(async (args) => {
          ownKeys.push(`${args.data.userId}:${args.data.codeId}`);
          return tx.promoRedemption.create(args);
        }),
      },
    };
    try {
      return await fn(scoped);
    } catch (error) {
      if (promo)
        promo.redeemedCount -= ownIncrements.reduce((a, b) => a + b, 0);
      ownKeys.forEach((k) => seen.delete(k));
      throw error;
    }
  });
  return { tx, promo };
}

const base: PromoRow = {
  id: "p1",
  code: "WELCOME-30",
  kind: "pro_days",
  value: 30,
  maxRedemptions: null,
  redeemedCount: 0,
  expiresAt: null,
  active: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  (grantManualPlan as jest.Mock).mockResolvedValue({
    plan: "PRO",
    currentPeriodEnd: new Date("2026-11-15T12:00:00Z"),
  });
  (extendTrialDays as jest.Mock).mockResolvedValue(
    new Date("2026-12-01T00:00:00Z")
  );
});

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as PromoError;
  }
  throw new Error("expected a rejection");
}

describe("redeemPromoCode", () => {
  it("looks the code up upper-case and trimmed, and grants Pro days through the manual-grant service", async () => {
    const w = world({ ...base });
    const result = await redeemPromoCode("u1", "  welcome-30 ");
    expect(w.tx.promoCode.findUnique).toHaveBeenCalledWith({
      where: { code: "WELCOME-30" },
    });
    expect(grantManualPlan).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: "u1", kind: "pro_days", days: 30 })
    );
    expect(result.kind).toBe("pro_days");
    expect(result.message).toMatch(/until 2026-11-15/);
    expect(w.promo!.redeemedCount).toBe(1);
  });

  it("extends the trial for a trial_days code", async () => {
    world({ ...base, kind: "trial_days", value: 14 });
    const result = await redeemPromoCode("u1", "WELCOME-30");
    expect(extendTrialDays).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: "u1", days: 14 })
    );
    expect(result.message).toMatch(/2026-12-01/);
  });

  it("grants Lifetime for a lifetime code", async () => {
    world({ ...base, kind: "lifetime", value: null });
    (grantManualPlan as jest.Mock).mockResolvedValue({
      plan: "LIFETIME",
      currentPeriodEnd: null,
    });
    const result = await redeemPromoCode("u1", "WELCOME-30");
    expect(grantManualPlan).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ kind: "lifetime" })
    );
    expect(result.message).toBe("You have Lifetime.");
  });

  it("says unknown for a code that does not exist or cannot be a code", async () => {
    world(null);
    expect((await failure(redeemPromoCode("u1", "NOPE-NOPE"))).code).toBe(
      "UNKNOWN"
    );
    expect((await failure(redeemPromoCode("u1", "x'; --"))).code).toBe(
      "UNKNOWN"
    );
    expect((await failure(redeemPromoCode("u1", "   "))).code).toBe("UNKNOWN");
    expect(grantManualPlan).not.toHaveBeenCalled();
  });

  it("says expired for a past date and for a switched-off code", async () => {
    world({ ...base, expiresAt: past });
    expect((await failure(redeemPromoCode("u1", "WELCOME-30"))).code).toBe(
      "EXPIRED"
    );
    world({ ...base, active: false });
    const error = await failure(redeemPromoCode("u1", "WELCOME-30"));
    expect(error.code).toBe("EXPIRED");
    expect(error.status).toBe(410);
  });

  it("lets a code with a future date through", async () => {
    world({ ...base, expiresAt: future });
    await expect(redeemPromoCode("u1", "WELCOME-30")).resolves.toBeDefined();
  });

  it("allows one use per person per code", async () => {
    const w = world({ ...base });
    await redeemPromoCode("u1", "WELCOME-30");
    const error = await failure(redeemPromoCode("u1", "WELCOME-30"));
    expect(error.code).toBe("ALREADY_USED");
    expect(w.promo!.redeemedCount).toBe(1);
    // Another person is not blocked by it.
    await expect(redeemPromoCode("u2", "WELCOME-30")).resolves.toBeDefined();
  });

  it("never gives out more than maxRedemptions, however the requests interleave", async () => {
    const w = world({ ...base, maxRedemptions: 2 });
    const results = await Promise.allSettled([
      redeemPromoCode("u1", "WELCOME-30"),
      redeemPromoCode("u2", "WELCOME-30"),
      redeemPromoCode("u3", "WELCOME-30"),
      redeemPromoCode("u4", "WELCOME-30"),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const refused = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected"
    );
    expect(ok).toHaveLength(2);
    expect(refused).toHaveLength(2);
    expect(refused.every((r) => r.reason.code === "USED_UP")).toBe(true);
    expect(w.promo!.redeemedCount).toBe(2);
    // The cap is a condition on the UPDATE itself, not a read-then-write.
    expect(w.tx.promoCode.updateMany.mock.calls[0][0].where).toMatchObject({
      redeemedCount: { lt: 2 },
    });
  });

  it("does not spend the code when the grant is refused", async () => {
    const w = world({ ...base, maxRedemptions: 1 });
    const { BillingGrantError } = jest.requireActual(
      "@/services/billing/manual-grant"
    );
    (grantManualPlan as jest.Mock).mockRejectedValueOnce(
      new BillingGrantError(
        "PAID_SUBSCRIPTION",
        "This account has a paid plan."
      )
    );
    const error = await failure(redeemPromoCode("u1", "WELCOME-30"));
    expect(error.code).toBe("NOT_ELIGIBLE");
    expect(error.status).toBe(409);
    expect(w.promo!.redeemedCount).toBe(0);
    // Still redeemable afterwards.
    await expect(redeemPromoCode("u1", "WELCOME-30")).resolves.toBeDefined();
  });

  it("treats a unique-constraint race from the same person as already used", async () => {
    world({ ...base });
    (prisma.$transaction as jest.Mock).mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("dup", {
        code: "P2002",
        clientVersion: "x",
      })
    );
    expect((await failure(redeemPromoCode("u1", "WELCOME-30"))).code).toBe(
      "ALREADY_USED"
    );
  });

  it("refuses a kind it does not know without spending anything", async () => {
    const w = world({ ...base, kind: "creem_discount" });
    expect((await failure(redeemPromoCode("u1", "WELCOME-30"))).code).toBe(
      "UNKNOWN"
    );
    expect(w.promo!.redeemedCount).toBe(0);
  });
});
