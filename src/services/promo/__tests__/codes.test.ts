import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import {
  CODE_PATTERN,
  PromoAdminError,
  createPromoCode,
  createPromoSchema,
  deactivatePromoCode,
  generatePromoCode,
  normalizePromoCode,
} from "../codes";

jest.mock("@/services/admin/audit", () => ({
  recordAdminAudit: jest.fn().mockResolvedValue({ id: "a1" }),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn(),
    promoCode: { create: jest.fn(), update: jest.fn() },
  },
}));

const db = prisma as unknown as {
  $transaction: jest.Mock;
  promoCode: { create: jest.Mock; update: jest.Mock };
};

const row = {
  id: "p1",
  code: "HELLO-30",
  kind: "pro_days",
  value: 30,
  maxRedemptions: null,
  redeemedCount: 0,
  expiresAt: null,
  active: true,
  createdAt: new Date("2026-10-16T00:00:00Z"),
};

beforeEach(() => {
  jest.clearAllMocks();
  db.$transaction.mockImplementation(async (fn) => fn(db));
});

describe("code text", () => {
  it("upper-cases and trims", () => {
    expect(normalizePromoCode("  hello-30 ")).toBe("HELLO-30");
  });

  it("generates ten unambiguous characters from a code that always passes the pattern", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      const code = generatePromoCode();
      expect(code).toMatch(/^[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}$/);
      expect(CODE_PATTERN.test(code)).toBe(true);
      seen.add(code);
    }
    expect(seen.size).toBe(500);
  });
});

describe("createPromoSchema", () => {
  const parse = (v: unknown) => createPromoSchema.safeParse(v);

  it("stores the code upper-case", () => {
    const r = parse({ code: "hello-30", kind: "pro_days", value: 30 });
    expect(r.success && r.data.code).toBe("HELLO-30");
  });

  it("needs days for trial and Pro codes but not for Lifetime", () => {
    expect(parse({ code: "ABC-1", kind: "trial_days" }).success).toBe(false);
    expect(parse({ code: "ABC-1", kind: "pro_days", value: 0 }).success).toBe(
      false
    );
    expect(parse({ code: "ABC-1", kind: "lifetime" }).success).toBe(true);
  });

  it("rejects spaces, symbols and a kind it does not know", () => {
    expect(parse({ code: "a b", kind: "lifetime" }).success).toBe(false);
    expect(parse({ code: "ab;--", kind: "lifetime" }).success).toBe(false);
    expect(parse({ code: "ABC-1", kind: "creem_discount" }).success).toBe(
      false
    );
  });

  it("reads expiresAt as a date", () => {
    const r = parse({
      code: "ABC-1",
      kind: "lifetime",
      expiresAt: "2026-12-31T23:59:59.000Z",
    });
    expect(r.success && r.data.expiresAt).toBeInstanceOf(Date);
  });
});

describe("createPromoCode / deactivatePromoCode", () => {
  it("creates with the actor and drops days from a lifetime code", async () => {
    db.promoCode.create.mockResolvedValue({
      ...row,
      kind: "lifetime",
      value: null,
    });
    const parsed = createPromoSchema.parse({
      code: "life-1",
      kind: "lifetime",
      value: 99,
    });
    await createPromoCode("admin-1", parsed);
    const data = db.promoCode.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      code: "LIFE-1",
      value: null,
      createdById: "admin-1",
    });
  });

  it("answers a duplicate code with a 409", async () => {
    db.promoCode.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", {
        code: "P2002",
        clientVersion: "x",
      })
    );
    const parsed = createPromoSchema.parse({
      code: "HELLO-30",
      kind: "pro_days",
      value: 30,
    });
    await expect(createPromoCode("admin-1", parsed)).rejects.toMatchObject({
      status: 409,
    });
  });

  it("deactivates, and says so for an unknown id", async () => {
    db.promoCode.update.mockResolvedValue({ ...row, active: false });
    const off = await deactivatePromoCode("admin-1", "p1");
    expect(off.active).toBe(false);
    expect(db.promoCode.update.mock.calls[0][0].data).toEqual({
      active: false,
    });
    db.promoCode.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("missing", {
        code: "P2025",
        clientVersion: "x",
      })
    );
    await expect(deactivatePromoCode("admin-1", "nope")).rejects.toBeInstanceOf(
      PromoAdminError
    );
  });
});
