import { NextRequest } from "next/server";

import { recordActivation } from "@/lib/activation-events";
import { isIcsSubscription } from "@/lib/calendar-feed-input";
import { prisma } from "@/lib/prisma";

import { POST } from "../route";

jest.mock("@/lib/auth/api-auth", () => ({
  authenticateRequest: jest.fn().mockResolvedValue({ userId: "u1" }),
}));
jest.mock("@/lib/activation-events", () => ({ recordActivation: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    calendarFeed: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "f1",
        ...data,
      })),
    },
  },
}));

const create = (body: unknown) =>
  POST(
    new NextRequest("http://localhost/api/feeds", {
      method: "POST",
      body: JSON.stringify(body),
    })
  );

beforeEach(() => jest.clearAllMocks());

describe("isIcsSubscription", () => {
  it("accepts only a LOCAL feed with a calendar link", () => {
    expect(
      isIcsSubscription({ type: "LOCAL", url: "https://x.test/a.ics" })
    ).toBe(true);
    expect(isIcsSubscription({ type: "LOCAL", url: "webcal://x.test/a" })).toBe(
      true
    );
    expect(isIcsSubscription({ type: "LOCAL", url: null })).toBe(false);
    expect(isIcsSubscription({ type: "LOCAL", url: "ftp://x.test/a" })).toBe(
      false
    );
    expect(
      isIcsSubscription({ type: "GOOGLE", url: "https://x.test/a.ics" })
    ).toBe(false);
  });
});

describe("POST /api/feeds activation", () => {
  it("counts an ICS subscription as a connected calendar", async () => {
    await create({ name: "Holidays", url: "https://x.test/h.ics" });
    expect(recordActivation).toHaveBeenCalledWith("calendar_connected", "u1", {
      provider: "ics",
    });
    expect(prisma.calendarFeed.create).toHaveBeenCalled();
  });

  it("does not count a plain local calendar", async () => {
    await create({ name: "Side" });
    expect(recordActivation).not.toHaveBeenCalled();
  });
});
