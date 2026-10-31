import { NextRequest } from "next/server";

import { POST } from "@/app/api/billing/checkout/route";

import { getCreemClient } from "@/lib/creem/client";
import { reserveLifetimeCheckout } from "@/lib/creem/lifetime-cap";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/auth/api-auth", () => ({
  authenticateRequest: jest.fn().mockResolvedValue({ userId: "user_1" }),
}));
jest.mock("@/lib/creem/client", () => ({ getCreemClient: jest.fn() }));
jest.mock("@/lib/creem/config", () => {
  const actual = jest.requireActual("@/lib/creem/config");
  return {
    ...actual,
    isCreemConfigured: jest.fn().mockReturnValue(true),
    getCreemProductId: jest.fn(
      (s: { plan: string; interval?: string }) =>
        (
          ({
            "pro:month": "prod_pro_monthly",
            "pro:year": "prod_pro_yearly",
            "lifetime:undefined": "prod_lifetime",
          }) as Record<string, string>
        )[`${s.plan}:${s.interval}`]
    ),
  };
});
jest.mock("@/lib/creem/lifetime-cap", () => ({
  attachLifetimeCheckout: jest.fn(),
  reserveLifetimeCheckout: jest.fn(),
}));
jest.mock("@/lib/feature-flags", () => ({
  isFeatureEnabled: jest.fn().mockResolvedValue(true),
}));
jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: jest.fn(), update: jest.fn() } },
}));
jest.mock("@/lib/security/rate-limit", () => ({
  accountRule: jest.fn(),
  enforceRateLimits: jest.fn().mockResolvedValue(null),
  ipRule: jest.fn(),
}));
jest.mock("@/lib/sandbox/guard", () => ({
  refuseSandbox: jest.fn().mockResolvedValue(null),
}));

const CODE = "NEEDT-STUDENT-40";

function request(body: unknown) {
  return new NextRequest("http://localhost/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function account(email: string) {
  return {
    id: "user_1",
    email,
    emailVerified: new Date("2026-09-01T00:00:00.000Z"),
    name: "Ana",
    studentEmail: null,
    studentVerifiedAt: null,
    studentSource: null,
    studentDiscountCode: null,
    studentLapsedAt: null,
  };
}

describe("student checkout", () => {
  const createCheckout = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CREEM_API_KEY = "creem_test_key";
    process.env.CREEM_STUDENT_DISCOUNT_CODE = CODE;
    createCheckout.mockResolvedValue({
      id: "checkout_1",
      checkoutUrl: "https://creem.test/checkout_1",
    });
    (getCreemClient as jest.Mock).mockReturnValue({
      checkouts: { create: createCheckout },
    });
  });

  afterAll(() => {
    delete process.env.CREEM_STUDENT_DISCOUNT_CODE;
  });

  it.each([
    ["year", "prod_pro_yearly"],
    ["month", "prod_pro_monthly"],
  ])(
    "student email gets 40% at checkout (Pro %s)",
    async (interval, productId) => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(
        account("ana@cs.ethz.ch")
      );

      const response = await POST(request({ plan: "pro", interval }));

      expect(response!.status).toBe(200);
      expect(createCheckout).toHaveBeenCalledWith(
        expect.objectContaining({
          productId,
          discountCode: CODE,
          metadata: expect.objectContaining({ student: "true" }),
        })
      );
    }
  );

  it("gmail address gets no discount", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue(
      account("ana@gmail.com")
    );

    await POST(request({ plan: "pro", interval: "year" }));

    const sent = createCheckout.mock.calls[0][0] as Record<string, unknown>;
    expect(sent).not.toHaveProperty("discountCode");
    expect(sent.metadata).not.toHaveProperty("student");
  });

  it("lifetime checkout ignores the student code", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      ...account("ana@ethz.ch"),
      studentEmail: "ana@ethz.ch",
      studentVerifiedAt: new Date("2026-10-01T00:00:00.000Z"),
      studentSource: "auto",
    });
    (reserveLifetimeCheckout as jest.Mock).mockResolvedValue({
      outcome: "reserved",
      reservation: {
        id: "reservation_1",
        requestId: "needt-lifetime-request_1",
        checkoutUrl: null,
      },
    });

    const response = await POST(request({ plan: "lifetime" }));

    expect(response!.status).toBe(200);
    const sent = createCheckout.mock.calls[0][0] as Record<string, unknown>;
    expect(sent.productId).toBe("prod_lifetime");
    expect(sent).not.toHaveProperty("discountCode");
  });
});
