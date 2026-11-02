import { NextRequest } from "next/server";

import { POST } from "@/app/api/billing/checkout/route";

import { getCreemClient } from "@/lib/creem/client";
import {
  attachLifetimeCheckout,
  reserveLifetimeCheckout,
} from "@/lib/creem/lifetime-cap";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/auth/api-auth", () => ({
  authenticateRequest: jest.fn().mockResolvedValue({ userId: "user_1" }),
}));
jest.mock("@/lib/creem/client", () => ({ getCreemClient: jest.fn() }));
jest.mock("@/lib/creem/config", () => ({
  getCreemProductId: jest.fn().mockReturnValue("prod_lifetime"),
  getStudentDiscountCode: jest.fn().mockReturnValue(null),
  isCreemConfigured: jest.fn().mockReturnValue(true),
}));
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
  prisma: {
    user: { findUnique: jest.fn(), update: jest.fn() },
    subscription: { findUnique: jest.fn() },
  },
}));
jest.mock("@/lib/security/rate-limit", () => ({
  accountRule: jest.fn(),
  enforceRateLimits: jest.fn().mockResolvedValue(null),
  ipRule: jest.fn(),
}));

const reservation = {
  id: "reservation_1",
  requestId: "needt-lifetime-request_1",
  creemCheckoutId: null,
  checkoutUrl: null,
  status: "CREATING",
};

function lifetimeRequest() {
  return new NextRequest("http://localhost/api/billing/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan: "lifetime", withdrawalWaiver: true }),
  });
}

describe("Lifetime checkout route", () => {
  const createCheckout = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CREEM_API_KEY = "creem_test_key";
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      email: "buyer@example.test",
      // Checkout refuses an unverified account, so the buyer must be verified
      // for these cap assertions to reach the provider at all.
      emailVerified: new Date("2026-09-01T00:00:00.000Z"),
      name: "Buyer",
    });
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);
    (getCreemClient as jest.Mock).mockReturnValue({
      checkouts: { create: createCheckout },
    });
  });

  function proRequest() {
    return new NextRequest("http://localhost/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        plan: "pro",
        interval: "month",
        withdrawalWaiver: true,
      }),
    });
  }

  it("refuses any checkout for a Lifetime owner before touching Creem", async () => {
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
      plan: "LIFETIME",
      status: "ACTIVE",
    });

    for (const request of [proRequest(), lifetimeRequest()]) {
      const response = await POST(request);
      expect(response!.status).toBe(409);
      expect((await response!.json()).code).toBe("ALREADY_LIFETIME");
    }
    expect(createCheckout).not.toHaveBeenCalled();
    expect(reserveLifetimeCheckout).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it.each(["ACTIVE", "PAST_DUE", "PAYMENT_FAILED"])(
    "refuses a Pro checkout while Pro is %s",
    async (status) => {
      (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
        plan: "PRO",
        status,
      });

      const response = await POST(proRequest());

      expect(response!.status).toBe(409);
      expect((await response!.json()).code).toBe("ALREADY_PRO");
      expect(createCheckout).not.toHaveBeenCalled();
    }
  );

  it("lets a Pro subscriber upgrade to Lifetime", async () => {
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
      plan: "PRO",
      status: "ACTIVE",
    });
    (reserveLifetimeCheckout as jest.Mock).mockResolvedValue({
      outcome: "reserved",
      reservation,
    });
    createCheckout.mockResolvedValue({
      id: "checkout_up",
      checkoutUrl: "https://creem.test/checkout_up",
    });

    const response = await POST(lifetimeRequest());

    expect(response!.status).toBe(200);
    expect(createCheckout).toHaveBeenCalledTimes(1);
  });

  it("lets a canceled Pro subscriber buy Pro again", async () => {
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
      plan: "PRO",
      status: "CANCELED",
    });
    createCheckout.mockResolvedValue({
      id: "checkout_re",
      checkoutUrl: "https://creem.test/checkout_re",
    });

    const response = await POST(proRequest());

    expect(response!.status).toBe(200);
    expect(createCheckout).toHaveBeenCalledTimes(1);
  });

  it("refuses checkout while the billing_checkout flag is off", async () => {
    (isFeatureEnabled as jest.Mock).mockResolvedValueOnce(false);

    const response = await POST(lifetimeRequest());

    expect(response!.status).toBe(503);
    expect(await response!.json()).toEqual({ error: "Checkout opens soon." });
    expect(isFeatureEnabled).toHaveBeenCalledWith("billing_checkout", "user_1");
    expect(reserveLifetimeCheckout).not.toHaveBeenCalled();
    expect(createCheckout).not.toHaveBeenCalled();
  });

  it("does not call Creem after the 300 slots are occupied", async () => {
    (reserveLifetimeCheckout as jest.Mock).mockResolvedValue({
      outcome: "closed",
    });

    const response = await POST(lifetimeRequest());

    expect(response!.status).toBe(409);
    expect(await response!.json()).toEqual({
      error: "Lifetime is closed.",
      code: "LIFETIME_CLOSED",
    });
    expect(createCheckout).not.toHaveBeenCalled();
  });

  it("uses the durable hold as Creem's idempotency key and metadata", async () => {
    (reserveLifetimeCheckout as jest.Mock).mockResolvedValue({
      outcome: "reserved",
      reservation,
    });
    createCheckout.mockResolvedValue({
      id: "checkout_1",
      checkoutUrl: "https://creem.test/checkout_1",
    });

    const response = await POST(lifetimeRequest());

    expect(response!.status).toBe(200);
    expect(createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: reservation.requestId,
        metadata: expect.objectContaining({
          userId: "user_1",
          lifetimeReservationId: reservation.id,
        }),
      })
    );
    expect(attachLifetimeCheckout).toHaveBeenCalledWith(reservation.id, {
      id: "checkout_1",
      checkoutUrl: "https://creem.test/checkout_1",
    });
  });

  it("reuses a stored checkout URL without creating a second checkout", async () => {
    (reserveLifetimeCheckout as jest.Mock).mockResolvedValue({
      outcome: "reserved",
      reservation: {
        ...reservation,
        checkoutUrl: "https://creem.test/checkout_1",
      },
    });

    const response = await POST(lifetimeRequest());

    expect(await response!.json()).toEqual({
      url: "https://creem.test/checkout_1",
    });
    expect(createCheckout).not.toHaveBeenCalled();
  });

  it("keeps an ambiguous provider failure fail-closed for an idempotent retry", async () => {
    (reserveLifetimeCheckout as jest.Mock).mockResolvedValue({
      outcome: "reserved",
      reservation,
    });
    createCheckout.mockRejectedValue(new Error("provider timeout"));

    const response = await POST(lifetimeRequest());

    expect(response!.status).toBe(502);
    expect(attachLifetimeCheckout).not.toHaveBeenCalled();
  });

  it("sends an onboarding buyer back to the last onboarding screen", async () => {
    createCheckout.mockResolvedValue({
      id: "checkout_2",
      checkoutUrl: "https://creem.test/checkout_2",
    });

    const response = await POST(
      new NextRequest("http://localhost/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: "pro",
          interval: "year",
          from: "onboarding",
          withdrawalWaiver: true,
        }),
      })
    );

    expect(response!.status).toBe(200);
    const sent = createCheckout.mock.calls[0][0] as { successUrl: string };
    const url = new URL(sent.successUrl);
    expect(url.pathname).toBe("/start");
    expect(url.searchParams.get("billing")).toBe("success");
    expect(url.searchParams.get("step")).toBe("opening");
  });

  it("refuses a checkout without the withdrawal acknowledgement", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "pro", interval: "month" }),
      })
    );

    expect(response!.status).toBe(400);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(createCheckout).not.toHaveBeenCalled();
  });

  it("stores the acknowledgement and sends it to Creem", async () => {
    createCheckout.mockResolvedValue({
      id: "checkout_3",
      checkoutUrl: "https://creem.test/checkout_3",
    });

    const response = await POST(
      new NextRequest("http://localhost/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: "pro",
          interval: "month",
          withdrawalWaiver: true,
        }),
      })
    );

    expect(response!.status).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: {
        withdrawalWaiverAt: expect.any(Date),
        withdrawalWaiverTermsVersion: expect.any(String),
      },
    });
    expect(createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ withdrawalWaiver: "true" }),
      })
    );
  });
});
