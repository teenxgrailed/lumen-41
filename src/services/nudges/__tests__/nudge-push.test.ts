import {
  MAX_NUDGE_PUSHES_PER_SWEEP,
  deliverNudgePushes,
} from "@/services/nudges/nudge-push";
import { deliverPush } from "@/services/reminders/reminder-delivery";

import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    proactiveNudge: { findMany: jest.fn(), updateMany: jest.fn() },
    notificationSettings: {
      findUnique: jest.fn().mockResolvedValue({ nudges: true }),
    },
    userSettings: { findUnique: jest.fn().mockResolvedValue(null) },
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));
jest.mock("@/services/reminders/reminder-delivery", () => ({
  deliverPush: jest.fn(),
}));

const nudges = jest.mocked(prisma.proactiveNudge);
const mockDeliver = jest.mocked(deliverPush);

const saved = {
  subject: process.env.VAPID_SUBJECT,
  publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  privateKey: process.env.VAPID_PRIVATE_KEY,
};

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

const sub = { id: "s1", endpoint: "https://p.test/1", p256dh: "p", auth: "a" };
const nudge = (id: string, userId = "u1") => ({
  id,
  userId,
  title: `Title ${id}`,
  body: `Body ${id}`,
  deepLink: `/today?task=${id}`,
  user: { pushSubscriptions: [sub] },
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env.VAPID_SUBJECT = "mailto:a@b.test";
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "pub";
  process.env.VAPID_PRIVATE_KEY = "priv";
  mockDeliver.mockResolvedValue(true);
});

afterAll(() => {
  restore("VAPID_SUBJECT", saved.subject);
  restore("NEXT_PUBLIC_VAPID_PUBLIC_KEY", saved.publicKey);
  restore("VAPID_PRIVATE_KEY", saved.privateKey);
});

describe("deliverNudgePushes", () => {
  it("does nothing without VAPID configuration", async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    await expect(deliverNudgePushes()).resolves.toEqual({ pushed: 0 });
    expect(nudges.findMany).not.toHaveBeenCalled();
  });

  it("asks only for unseen nudges of people who opted in and have a device", async () => {
    nudges.findMany.mockResolvedValue([]);
    await deliverNudgePushes();
    expect(nudges.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deliveredAt: null,
          user: {
            notificationSettings: { is: { nudges: true } },
            pushSubscriptions: { some: {} },
          },
        }),
      })
    );
  });

  it("caps pushes per person and closes out the whole backlog", async () => {
    nudges.findMany.mockResolvedValue([
      nudge("a"),
      nudge("b"),
      nudge("c"),
      nudge("d"),
    ] as never);
    const result = await deliverNudgePushes(new Date("2026-10-19T10:00:00Z"));
    expect(result.pushed).toBe(MAX_NUDGE_PUSHES_PER_SWEEP);
    expect(mockDeliver).toHaveBeenCalledTimes(MAX_NUDGE_PUSHES_PER_SWEEP);
    expect(mockDeliver).toHaveBeenCalledWith(sub, {
      title: "Title a",
      body: "Body a",
      url: "/today?task=a",
    });
    expect(nudges.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["a", "b", "c", "d"] }, deliveredAt: null },
      data: { deliveredAt: new Date("2026-10-19T10:00:00Z") },
    });
  });

  it("counts each person separately", async () => {
    nudges.findMany.mockResolvedValue([
      nudge("a", "u1"),
      nudge("b", "u2"),
    ] as never);
    const result = await deliverNudgePushes();
    expect(result.pushed).toBe(2);
    expect(nudges.updateMany).toHaveBeenCalledTimes(2);
  });

  it("survives a failing push service and still closes the nudges", async () => {
    nudges.findMany.mockResolvedValue([nudge("a")] as never);
    mockDeliver.mockRejectedValue(new Error("Push provider returned 500"));
    await expect(deliverNudgePushes()).resolves.toEqual({ pushed: 0 });
    expect(nudges.updateMany).toHaveBeenCalledTimes(1);
  });
});
