import { LifetimeCheckoutReservationStatus } from "@prisma/client";

import {
  attachLifetimeCheckout,
  authorizeLifetimeCompletion,
  isLifetimeCheckoutAvailable,
  reserveLifetimeCheckout,
} from "@/lib/creem/lifetime-cap";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn(),
    $executeRaw: jest.fn(),
    subscription: { findUnique: jest.fn(), count: jest.fn() },
    lifetimeHold: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

const openReservation = {
  id: "reservation_1",
  requestId: "needt-lifetime-request_1",
  creemCheckoutId: null,
  checkoutUrl: null,
  status: LifetimeCheckoutReservationStatus.CREATING,
};

describe("Lifetime checkout capacity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (operation: (transaction: typeof prisma) => Promise<unknown>) =>
        operation(prisma)
    );
    (prisma.$executeRaw as jest.Mock).mockResolvedValue(0);
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.subscription.count as jest.Mock).mockResolvedValue(0);
    (prisma.lifetimeHold.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.lifetimeHold.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.lifetimeHold.count as jest.Mock).mockResolvedValue(0);
    (prisma.lifetimeHold.create as jest.Mock).mockResolvedValue(
      openReservation
    );
  });

  it("closes atomically when all 300 slots are occupied", async () => {
    (prisma.subscription.count as jest.Mock).mockResolvedValue(299);
    (prisma.lifetimeHold.count as jest.Mock).mockResolvedValue(1);

    await expect(reserveLifetimeCheckout("user_301")).resolves.toEqual({
      outcome: "closed",
    });
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.lifetimeHold.create).not.toHaveBeenCalled();
  });

  it("lets a refunded Lifetime buyer buy again by recycling the consumed hold", async () => {
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
      plan: "FREE",
    });
    (prisma.lifetimeHold.findUnique as jest.Mock).mockResolvedValue({
      ...openReservation,
      status: LifetimeCheckoutReservationStatus.CONSUMED,
      creemCheckoutId: "checkout_old",
      checkoutUrl: "https://creem.test/old",
    });
    (prisma.lifetimeHold.update as jest.Mock).mockResolvedValue(
      openReservation
    );

    await expect(reserveLifetimeCheckout("user_1")).resolves.toMatchObject({
      outcome: "reserved",
    });
    expect(prisma.lifetimeHold.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "reservation_1" },
        data: expect.objectContaining({
          status: LifetimeCheckoutReservationStatus.CREATING,
          creemCheckoutId: null,
          checkoutUrl: null,
        }),
      })
    );
  });

  it("still refuses a current Lifetime owner", async () => {
    (prisma.subscription.findUnique as jest.Mock).mockResolvedValue({
      plan: "LIFETIME",
    });

    await expect(reserveLifetimeCheckout("user_1")).resolves.toEqual({
      outcome: "already_owned",
    });
  });

  it("reuses a user's open hold instead of consuming another slot", async () => {
    (prisma.lifetimeHold.findUnique as jest.Mock).mockResolvedValue(
      openReservation
    );

    await expect(reserveLifetimeCheckout("user_1")).resolves.toEqual({
      outcome: "reserved",
      reservation: openReservation,
    });
    expect(prisma.subscription.count).not.toHaveBeenCalled();
    expect(prisma.lifetimeHold.create).not.toHaveBeenCalled();
  });

  it("never reopens a hold consumed by an early webhook", async () => {
    await attachLifetimeCheckout("reservation_1", {
      id: "checkout_1",
      checkoutUrl: "https://creem.test/checkout_1",
    });

    expect(prisma.lifetimeHold.updateMany).toHaveBeenCalledWith({
      where: {
        id: "reservation_1",
        status: { in: ["CREATING", "PENDING"] },
      },
      data: {
        creemCheckoutId: "checkout_1",
        checkoutUrl: "https://creem.test/checkout_1",
        status: "PENDING",
      },
    });
  });

  it("retries a serializable conflict without admitting past the cap", async () => {
    (prisma.$transaction as jest.Mock)
      .mockRejectedValueOnce({ code: "P2034" })
      .mockImplementationOnce(
        async (operation: (transaction: typeof prisma) => Promise<unknown>) =>
          operation(prisma)
      );

    await expect(reserveLifetimeCheckout("user_1")).resolves.toEqual({
      outcome: "reserved",
      reservation: openReservation,
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it("keeps an existing user's checkout available when the public cap is full", async () => {
    (prisma.lifetimeHold.findUnique as jest.Mock).mockResolvedValue({
      status: LifetimeCheckoutReservationStatus.PENDING,
    });
    (prisma.subscription.count as jest.Mock).mockResolvedValue(300);

    await expect(isLifetimeCheckoutAvailable("user_1")).resolves.toBe(true);
  });

  it("binds completion to the signed checkout reservation", async () => {
    (prisma.lifetimeHold.findFirst as jest.Mock).mockResolvedValue({
      ...openReservation,
      userId: "user_1",
    });

    await expect(
      authorizeLifetimeCompletion(prisma, {
        userId: "user_1",
        reservationId: "reservation_1",
        checkoutId: "checkout_1",
        requestId: "needt-lifetime-request_1",
      })
    ).resolves.toEqual({
      allowed: true,
      reservationId: "reservation_1",
      unreserved: false,
    });
    expect(prisma.lifetimeHold.update).toHaveBeenCalledWith({
      where: { id: "reservation_1" },
      data: { creemCheckoutId: "checkout_1" },
    });
  });

  it("grants a paid completion with no matching reservation and flags it", async () => {
    // The seat cap is enforced when the checkout is created. Refusing here
    // would keep money Creem has already taken and leave the buyer on FREE.
    await expect(
      authorizeLifetimeCompletion(prisma, {
        userId: "user_1",
        reservationId: "unknown",
        checkoutId: "checkout_1",
        requestId: "unknown-request",
      })
    ).resolves.toEqual({
      allowed: true,
      reservationId: null,
      unreserved: true,
    });
  });
});
