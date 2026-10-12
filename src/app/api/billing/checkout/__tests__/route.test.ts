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
  prisma: { user: { findUnique: jest.fn() } },
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
    body: JSON.stringify({ plan: "lifetime" }),
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
    (getCreemClient as jest.Mock).mockReturnValue({
      checkouts: { create: createCheckout },
    });
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
});
