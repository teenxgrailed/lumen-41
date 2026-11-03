import {
  clearCalendarFeedPushUnsupported,
  markCalendarFeedPushUnsupported,
} from "@/lib/calendar-db";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn(),
    calendarFeed: { update: jest.fn((args) => ({ op: "update", args })) },
    calendarWebhook: {
      deleteMany: jest.fn((args) => ({ op: "deleteMany", args })),
    },
  },
}));

describe("markCalendarFeedPushUnsupported", () => {
  beforeEach(() => jest.clearAllMocks());

  it("sets the flag and drops the webhook rows in one transaction", async () => {
    await markCalendarFeedPushUnsupported("f");

    expect(prisma.calendarFeed.update).toHaveBeenCalledWith({
      where: { id: "f" },
      data: { pushUnsupportedAt: expect.any(Date) },
    });
    expect(prisma.calendarWebhook.deleteMany).toHaveBeenCalledWith({
      where: { feedId: "f" },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const operations = (prisma.$transaction as jest.Mock).mock.calls[0][0];
    expect(operations.map((entry: { op: string }) => entry.op)).toEqual([
      "update",
      "deleteMany",
    ]);
  });
});

describe("clearCalendarFeedPushUnsupported", () => {
  beforeEach(() => jest.clearAllMocks());

  it("resets the flag", async () => {
    await clearCalendarFeedPushUnsupported("f");
    expect(prisma.calendarFeed.update).toHaveBeenCalledWith({
      where: { id: "f" },
      data: { pushUnsupportedAt: null },
    });
  });
});
