import {
  listCalDavFeedIdsForSweep,
  listStaleWebhookFeedIds,
  recordCalendarFeedSyncFailure,
  updateCalendarFeedSyncState,
} from "@/lib/calendar-db";
import { prisma } from "@/lib/prisma";
import {
  SYNC_BACKOFF_BASE_MS,
  SYNC_REAUTH_BACKOFF_MS,
} from "@/lib/sync-backoff";

jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    calendarFeed: {
      findMany: jest.fn(async () => [{ id: "g1" }]),
      update: jest.fn(),
    },
  },
}));

const findMany = prisma.calendarFeed.findMany as jest.Mock;
const update = prisma.calendarFeed.update as jest.Mock;

beforeEach(() => {
  findMany.mockClear();
  update.mockReset();
});

const backoffClause = {
  OR: [
    { nextSyncAttemptAt: null },
    { nextSyncAttemptAt: { lte: expect.any(Date) } },
  ],
};

describe("listStaleWebhookFeedIds", () => {
  it("selects GOOGLE and OUTLOOK feeds with a null or old lastSync, oldest attempt first, skipping feeds in backoff", async () => {
    const ids = await listStaleWebhookFeedIds(6 * 3_600_000, 25);
    expect(ids).toEqual(["g1"]);
    const args = findMany.mock.calls[0][0];
    expect(args.where.type).toEqual({ in: ["GOOGLE", "OUTLOOK"] });
    expect(args.where.OR[0]).toEqual({ lastSync: null });
    expect(args.where.OR[1].lastSync.lt).toBeInstanceOf(Date);
    expect(args.where.AND).toEqual([backoffClause]);
    expect(args.orderBy).toEqual([
      { lastSyncAttemptAt: { sort: "asc", nulls: "first" } },
      { lastSync: { sort: "asc", nulls: "first" } },
    ]);
    expect(args.take).toBe(25);
  });
});

describe("listCalDavFeedIdsForSweep", () => {
  it("is batch-limited and picks only feeds not synced recently or in backoff", async () => {
    await listCalDavFeedIdsForSweep(10 * 60_000, 50);
    const args = findMany.mock.calls[0][0];
    expect(args.where.type).toBe("CALDAV");
    expect(args.take).toBe(50);
    expect(args.where.AND[0]).toEqual(backoffClause);
    expect(args.where.AND[1].OR[0]).toEqual({ lastSync: null });
    expect(args.where.AND[1].OR[1].lastSync.lt).toBeInstanceOf(Date);
    expect(args.orderBy[0]).toEqual({
      lastSyncAttemptAt: { sort: "asc", nulls: "first" },
    });
  });
});

describe("updateCalendarFeedSyncState", () => {
  it("a successful sync is the latest attempt and ends the backoff", async () => {
    const lastSync = new Date("2026-11-02T10:00:00.000Z");
    await updateCalendarFeedSyncState("f1", { lastSync, error: null });
    expect(update).toHaveBeenCalledWith({
      where: { id: "f1" },
      data: {
        lastSync,
        error: null,
        lastSyncAttemptAt: lastSync,
        syncFailureCount: 0,
        nextSyncAttemptAt: null,
      },
    });
  });

  it("an update without lastSync leaves the backoff fields alone", async () => {
    await updateCalendarFeedSyncState("f1", { syncToken: null });
    expect(update).toHaveBeenCalledWith({
      where: { id: "f1" },
      data: { syncToken: null },
    });
  });
});

describe("recordCalendarFeedSyncFailure", () => {
  it("stamps the attempt, counts the failure and backs off exponentially", async () => {
    update.mockResolvedValueOnce({ syncFailureCount: 3 });
    update.mockResolvedValueOnce({});
    const before = Date.now();
    await recordCalendarFeedSyncFailure("f1", new Error("boom"));
    expect(update.mock.calls[0][0].data).toEqual({
      error: "boom",
      lastSyncAttemptAt: expect.any(Date),
      syncFailureCount: { increment: 1 },
    });
    const next = update.mock.calls[1][0].data.nextSyncAttemptAt as Date;
    // third failure: 15 min * 2^2
    const wait = next.getTime() - before;
    expect(wait).toBeGreaterThanOrEqual(SYNC_BACKOFF_BASE_MS * 4 - 1000);
    expect(wait).toBeLessThan(SYNC_BACKOFF_BASE_MS * 4 + 5000);
  });

  it("holds a feed with a revoked sign-in out for a day", async () => {
    update.mockResolvedValueOnce({ syncFailureCount: 1 });
    update.mockResolvedValueOnce({});
    const before = Date.now();
    await recordCalendarFeedSyncFailure("f1", new Error("invalid_grant"));
    const next = update.mock.calls[1][0].data.nextSyncAttemptAt as Date;
    expect(next.getTime() - before).toBeGreaterThanOrEqual(
      SYNC_REAUTH_BACKOFF_MS - 1000
    );
  });

  it("counts one failure once when two layers record the same error", async () => {
    update.mockResolvedValue({ syncFailureCount: 1 });
    const error = new Error("boom");
    await recordCalendarFeedSyncFailure("f1", error);
    await recordCalendarFeedSyncFailure("f1", error);
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("never throws when the feed is gone", async () => {
    update.mockRejectedValue(new Error("P2025"));
    await expect(
      recordCalendarFeedSyncFailure("gone", new Error("x"))
    ).resolves.toBeUndefined();
  });
});
