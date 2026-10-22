import { NextRequest } from "next/server";

import { PATCH } from "@/app/api/auto-schedule-settings/route";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/auth/api-auth", () => ({
  authenticateRequest: jest.fn(),
}));
jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    autoScheduleSettings: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    calendarFeed: { findFirst: jest.fn() },
  },
}));
jest.mock("@/lib/task-block-push", () => ({
  removeAllTaskBlocks: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/work-week-server", () => ({
  loadWeekHours: jest.fn().mockResolvedValue([]),
  saveWeekHours: jest.fn(),
  weekAfterLegacyWrite: jest.fn().mockReturnValue(null),
}));

const settings = prisma.autoScheduleSettings as unknown as {
  findUnique: jest.Mock;
  upsert: jest.Mock;
};
const feeds = prisma.calendarFeed as unknown as { findFirst: jest.Mock };

async function patch(body: unknown) {
  const response = await PATCH(
    new NextRequest("http://localhost/api/auto-schedule-settings", {
      method: "PATCH",
      body: JSON.stringify(body),
    })
  );
  if (!response) throw new Error("Expected a response");
  return response;
}

describe("PATCH /api/auto-schedule-settings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(authenticateRequest).mockResolvedValue({ userId: "user-1" });
    settings.findUnique.mockResolvedValue({ userId: "user-1" });
    settings.upsert.mockResolvedValue({ userId: "user-1" });
    feeds.findFirst.mockResolvedValue(null);
  });

  it("writes only the preference columns, to the caller's own row", async () => {
    const response = await patch({
      id: "row-of-someone-else",
      userId: "someone-else",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      isAdmin: true,
      bufferMinutes: 30,
    });

    expect(response.status).toBe(200);
    const args = settings.upsert.mock.calls[0][0];
    expect(args.where).toEqual({ userId: "user-1" });
    expect(args.update).toEqual({ bufferMinutes: 30 });
    expect(args.create).toMatchObject({ userId: "user-1", bufferMinutes: 30 });
    expect(args.create).not.toHaveProperty("id");
    expect(args.create).not.toHaveProperty("isAdmin");
  });

  it("refuses a relation or other nested value and writes nothing", async () => {
    const response = await patch({
      user: { connect: { id: "someone-else" } },
    });

    expect(response.status).toBe(400);
    expect(settings.upsert).not.toHaveBeenCalled();
  });

  it("refuses a non-scalar value for a known column", async () => {
    const response = await patch({ workHourStart: { set: 3 } });

    expect(response.status).toBe(400);
    expect(settings.upsert).not.toHaveBeenCalled();
  });

  it("refuses a body that is not an object", async () => {
    expect((await patch(null)).status).toBe(400);
    expect((await patch([1])).status).toBe(400);
    expect(settings.upsert).not.toHaveBeenCalled();
  });

  it("refuses a push calendar that belongs to someone else", async () => {
    feeds.findFirst.mockResolvedValue(null);

    const response = await patch({
      pushTasksToCalendar: true,
      pushTasksFeedId: "feed-of-someone-else",
    });

    expect(response.status).toBe(400);
    expect(feeds.findFirst).toHaveBeenCalledWith({
      where: { id: "feed-of-someone-else", userId: "user-1" },
      select: { id: true },
    });
    expect(settings.upsert).not.toHaveBeenCalled();
  });

  it("accepts the caller's own calendar as the push target", async () => {
    feeds.findFirst.mockResolvedValue({ id: "feed-1" });

    const response = await patch({
      pushTasksToCalendar: true,
      pushTasksFeedId: "feed-1",
    });

    expect(response.status).toBe(200);
    expect(feeds.findFirst).toHaveBeenCalledWith({
      where: { id: "feed-1", userId: "user-1" },
      select: { id: true },
    });
    const args = settings.upsert.mock.calls[0][0];
    expect(args.update).toEqual({
      pushTasksToCalendar: true,
      pushTasksFeedId: "feed-1",
    });
    expect(args.create).toMatchObject({ pushTasksFeedId: "feed-1" });
  });

  it("lets the push calendar be cleared without a lookup", async () => {
    const response = await patch({ pushTasksFeedId: null });

    expect(response.status).toBe(200);
    expect(feeds.findFirst).not.toHaveBeenCalled();
    expect(settings.upsert.mock.calls[0][0].update).toEqual({
      pushTasksFeedId: null,
    });
  });
});
