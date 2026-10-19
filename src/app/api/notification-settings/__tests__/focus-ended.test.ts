import { NextRequest } from "next/server";

import { GET, PATCH } from "@/app/api/notification-settings/route";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: { notificationSettings: { upsert: jest.fn() } },
}));
jest.mock("@/lib/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const upsert = jest.mocked(prisma.notificationSettings.upsert);

function stored(focusEnded: boolean) {
  return {
    userId: "u1",
    emailNotifications: true,
    dailyEmailEnabled: true,
    eventInvites: true,
    eventUpdates: true,
    eventCancellations: true,
    eventReminders: true,
    defaultReminderTiming: "[30]",
    webPushEnabled: false,
    webPushSubscription: null,
    focusEnded,
  } as never;
}

beforeEach(() => {
  jest.mocked(authenticateRequest).mockResolvedValue({ userId: "u1" } as never);
});

it("GET exposes focusEnded", async () => {
  upsert.mockResolvedValue(stored(true));
  const res = await GET(
    new NextRequest("http://localhost/api/notification-settings")
  );
  expect((await res!.json()).focusEnded).toBe(true);
});

it("PATCH stores focusEnded and returns it", async () => {
  upsert.mockResolvedValue(stored(false));
  const res = await PATCH(
    new NextRequest("http://localhost/api/notification-settings", {
      method: "PATCH",
      body: JSON.stringify({ focusEnded: false }),
    })
  );
  expect(upsert.mock.calls.at(-1)![0].update).toMatchObject({
    focusEnded: false,
  });
  expect((await res!.json()).focusEnded).toBe(false);
});

it("PATCH rejects a non-boolean focusEnded", async () => {
  const res = await PATCH(
    new NextRequest("http://localhost/api/notification-settings", {
      method: "PATCH",
      body: JSON.stringify({ focusEnded: "yes" }),
    })
  );
  expect(res!.status).toBe(400);
});
