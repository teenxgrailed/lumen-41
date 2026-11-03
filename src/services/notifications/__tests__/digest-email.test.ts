import { EmailService } from "@/lib/email/email-service";
import { prisma } from "@/lib/prisma";

import { deliverDailyDigests } from "../digest";
import { getNotificationFeed } from "../feed";
import { DEFAULT_PREFS, getNotificationPrefs } from "../preferences";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    notificationSettings: { findMany: jest.fn(), updateMany: jest.fn() },
  },
}));
jest.mock("@/lib/email/email-service", () => ({
  EmailService: { sendEmail: jest.fn() },
}));
jest.mock("@/lib/email/unsubscribe", () => ({
  unsubscribeUrl: () => "https://use.needt.app/api/email/unsubscribe?t=T",
}));
jest.mock("@/lib/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn().mockResolvedValue(undefined),
    error: jest.fn(),
  },
}));
jest.mock("../feed", () => ({ getNotificationFeed: jest.fn() }));
jest.mock("../preferences", () => ({
  ...jest.requireActual("../preferences"),
  getNotificationPrefs: jest.fn(),
}));

const db = prisma as unknown as Record<string, Record<string, jest.Mock>>;
const now = new Date("2026-10-27T09:00:00.000Z");

beforeEach(() => {
  jest.clearAllMocks();
  db.notificationSettings.findMany.mockResolvedValue([
    {
      userId: "u1",
      lastDigestAt: null,
      user: {
        email: "a@b.test",
        emailVerified: new Date(),
        pushSubscriptions: [],
        nativePushTokens: [],
      },
    },
  ]);
  db.notificationSettings.updateMany.mockResolvedValue({ count: 1 });
  (getNotificationFeed as jest.Mock).mockResolvedValue({
    items: [
      {
        id: "f1",
        kind: "comment",
        unread: true,
        at: "2026-10-27T07:00:00.000Z",
        title: "A comment",
      },
    ],
  });
});

describe("deliverDailyDigests", () => {
  it("emails the digest to someone who chose it", async () => {
    (getNotificationPrefs as jest.Mock).mockResolvedValue({
      ...DEFAULT_PREFS,
      digest: true,
      emailNotifications: true,
    });
    await deliverDailyDigests(now);
    expect(EmailService.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("sends no email when the person switched the digest email off", async () => {
    (getNotificationPrefs as jest.Mock).mockResolvedValue({
      ...DEFAULT_PREFS,
      digest: true,
      emailNotifications: false,
    });
    await deliverDailyDigests(now);
    expect(EmailService.sendEmail).not.toHaveBeenCalled();
  });
});
