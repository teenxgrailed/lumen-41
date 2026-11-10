import { NextRequest } from "next/server";

import { PATCH } from "@/app/api/events/[id]/route";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

jest.mock("@/services/reminders/reminders", () => ({
  rescheduleRemindersSoon: jest.fn(),
}));
jest.mock("@/lib/auth/api-auth", () => ({
  authenticateRequest: jest.fn(),
}));
jest.mock("@/lib/calendar-db", () => ({ getEvent: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    calendarEvent: { findUnique: jest.fn(), update: jest.fn() },
  },
}));

const findUnique = prisma.calendarEvent.findUnique as unknown as jest.Mock;
const update = prisma.calendarEvent.update as unknown as jest.Mock;

function patch(body: unknown) {
  return PATCH(
    new NextRequest("http://localhost/api/events/e1", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "e1" }) }
  );
}

describe("PATCH /api/events/[id]", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(authenticateRequest)
      .mockResolvedValue({ userId: "u1" } as never);
    findUnique.mockResolvedValue({
      id: "e1",
      archivedAt: null,
      start: new Date("2026-11-10T10:00:00Z"),
      end: new Date("2026-11-10T11:00:00Z"),
      feed: { userId: "u1" },
    });
    update.mockResolvedValue({ id: "e1" });
  });

  it("requires the editor role", async () => {
    await patch({ title: "x" });
    expect(authenticateRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ requiredRole: "EDITOR" })
    );
  });

  it("drops fields a person does not edit (feedId, externalEventId, ...)", async () => {
    const res = await patch({
      title: "New",
      feedId: "other-feed",
      externalEventId: "ext",
      masterEventId: "m",
      isMaster: true,
    });
    expect(res?.status).toBe(200);
    expect(update.mock.calls[0][0].data).toEqual({ title: "New" });
  });

  it("rejects an inverted time range", async () => {
    const res = await patch({ end: "2026-11-10T09:00:00Z" });
    expect(res?.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });
});
