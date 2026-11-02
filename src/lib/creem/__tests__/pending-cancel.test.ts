import { getCreemClient } from "@/lib/creem/client";
import {
  PENDING_CANCEL_BATCH,
  isAlreadyCanceled,
  pendingCancelBackoffMs,
  retryPendingCreemCancels,
  settlePendingCreemCancel,
} from "@/lib/creem/pending-cancel";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/creem/client", () => ({ getCreemClient: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    subscription: { findMany: jest.fn(), updateMany: jest.fn() },
  },
}));

const cancel = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  cancel.mockReset().mockResolvedValue({});
  (getCreemClient as jest.Mock).mockReset().mockReturnValue({
    subscriptions: { cancel },
  });
});

describe("settlePendingCreemCancel", () => {
  it("cancels immediately and clears the marker on success", async () => {
    await expect(settlePendingCreemCancel("u1", "sub_1")).resolves.toBe(true);

    expect(cancel).toHaveBeenCalledWith("sub_1", { mode: "immediate" });
    expect(prisma.subscription.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1", pendingCreemCancelId: "sub_1" },
      data: {
        pendingCreemCancelId: null,
        pendingCreemCancelAttempts: 0,
        pendingCreemCancelNextAt: null,
      },
    });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("treats a 404 as success and logs it at warn, not error", async () => {
    cancel.mockRejectedValue(
      Object.assign(new Error("Not found"), { statusCode: 404, body: "" })
    );

    await expect(settlePendingCreemCancel("u1", "sub_1")).resolves.toBe(true);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("already canceled"),
      expect.objectContaining({ creemSubscriptionId: "sub_1" }),
      "CreemPendingCancel"
    );
    expect(logger.error).not.toHaveBeenCalled();
    expect(prisma.subscription.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ pendingCreemCancelId: null }),
      })
    );
  });

  it("treats an 'already canceled' 400 as success", async () => {
    cancel.mockRejectedValue(
      Object.assign(new Error("Bad request"), {
        statusCode: 400,
        body: '{"message":"Subscription is already canceled"}',
      })
    );

    await expect(settlePendingCreemCancel("u1", "sub_1")).resolves.toBe(true);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("logs a real failure at error and schedules a backoff retry", async () => {
    cancel.mockRejectedValue(
      Object.assign(new Error("creem down"), { statusCode: 503 })
    );

    await expect(settlePendingCreemCancel("u1", "sub_1", 2)).resolves.toBe(
      false
    );

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("superseded by Lifetime"),
      expect.objectContaining({ creemSubscriptionId: "sub_1", attempts: 3 }),
      "CreemPendingCancel"
    );
    expect(logger.warn).not.toHaveBeenCalled();
    const call = (prisma.subscription.updateMany as jest.Mock).mock.calls[0][0];
    expect(call.where).toEqual({
      userId: "u1",
      pendingCreemCancelId: "sub_1",
    });
    expect(call.data.pendingCreemCancelAttempts).toBe(3);
    expect(call.data.pendingCreemCancelNextAt).toBeInstanceOf(Date);
    expect(call.data.pendingCreemCancelId).toBeUndefined();
  });

  it("keeps the marker when the client cannot even be built", async () => {
    (getCreemClient as jest.Mock).mockImplementation(() => {
      throw new Error("Creem is not configured.");
    });

    await expect(settlePendingCreemCancel("u1", "sub_1")).resolves.toBe(false);
    expect(logger.error).toHaveBeenCalled();
  });
});

describe("isAlreadyCanceled", () => {
  it("does not hide 5xx, auth or unknown errors", () => {
    expect(isAlreadyCanceled({ statusCode: 500, body: "canceled" })).toBe(
      false
    );
    expect(isAlreadyCanceled({ statusCode: 401, body: "bad key" })).toBe(false);
    expect(isAlreadyCanceled(new Error("boom"))).toBe(false);
    expect(isAlreadyCanceled(null)).toBe(false);
  });
});

describe("pendingCancelBackoffMs", () => {
  it("doubles from one minute and caps at six hours", () => {
    expect(pendingCancelBackoffMs(0)).toBe(60_000);
    expect(pendingCancelBackoffMs(1)).toBe(120_000);
    expect(pendingCancelBackoffMs(20)).toBe(6 * 60 * 60_000);
  });
});

describe("retryPendingCreemCancels", () => {
  it("retries only due rows and counts the settled ones", async () => {
    (prisma.subscription.findMany as jest.Mock).mockResolvedValue([
      {
        userId: "u1",
        pendingCreemCancelId: "sub_1",
        pendingCreemCancelAttempts: 1,
      },
      {
        userId: "u2",
        pendingCreemCancelId: "sub_2",
        pendingCreemCancelAttempts: 4,
      },
    ]);
    cancel
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(
        Object.assign(new Error("down"), { statusCode: 502 })
      );

    await expect(retryPendingCreemCancels()).resolves.toBe(1);

    const query = (prisma.subscription.findMany as jest.Mock).mock.calls[0][0];
    expect(query.where.pendingCreemCancelId).toEqual({ not: null });
    expect(query.where.OR).toEqual([
      { pendingCreemCancelNextAt: null },
      { pendingCreemCancelNextAt: { lte: expect.any(Date) } },
    ]);
    expect(query.take).toBe(PENDING_CANCEL_BATCH);
    expect(cancel).toHaveBeenCalledTimes(2);
  });
});
