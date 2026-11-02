import { listStaleWebhookFeedIds } from "@/lib/calendar-db";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: { calendarFeed: { findMany: jest.fn(async () => [{ id: "g1" }]) } },
}));

describe("listStaleWebhookFeedIds", () => {
  it("selects GOOGLE and OUTLOOK feeds with a null or old lastSync, never-synced first", async () => {
    const ids = await listStaleWebhookFeedIds(6 * 3_600_000, 25);
    expect(ids).toEqual(["g1"]);
    const args = (prisma.calendarFeed.findMany as jest.Mock).mock.calls[0][0];
    expect(args.where.type).toEqual({ in: ["GOOGLE", "OUTLOOK"] });
    expect(args.where.OR[0]).toEqual({ lastSync: null });
    expect(args.where.OR[1].lastSync.lt).toBeInstanceOf(Date);
    expect(args.orderBy).toEqual({ lastSync: { sort: "asc", nulls: "first" } });
    expect(args.take).toBe(25);
  });
});
