import { deliverDailyDigests } from "../digest";

const state = { replaces: true, feedCalls: 0 };

jest.mock("@/lib/prisma", () => ({
  prisma: {
    notificationSettings: {
      findMany: async () => [
        {
          userId: "u1",
          lastDigestAt: null,
          user: {
            email: null,
            emailVerified: null,
            pushSubscriptions: [{ id: "s1" }],
            nativePushTokens: [],
          },
        },
      ],
      updateMany: async () => ({ count: 1 }),
    },
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock("@/lib/email/email-service", () => ({
  EmailService: { sendEmail: jest.fn() },
}));
jest.mock("../preferences", () => ({
  digestDue: () => true,
  getNotificationPrefs: async () => ({
    channelPush: true,
    emailNotifications: false,
  }),
  typeOfFeedKind: () => "mention",
}));
jest.mock("../feed", () => ({
  getNotificationFeed: async () => {
    state.feedCalls += 1;
    return { items: [] };
  },
}));
jest.mock("../alerts", () => ({
  alertable: () => true,
  digestSummary: () => null,
}));
jest.mock("@/services/push/targets", () => ({
  PUSH_TARGET_SELECT: {},
  pushConfigured: () => true,
  pushTargetsOf: (user: { pushSubscriptions: unknown[] }) =>
    user.pushSubscriptions,
}));
jest.mock("@/services/reminders/reminder-delivery", () => ({
  deliverPush: jest.fn(),
}));
jest.mock("@/services/day-plan/touches", () => ({
  morningTouchReplacesDigest: async () => state.replaces,
}));

beforeEach(() => {
  state.feedCalls = 0;
});

test("test_morning_digest_skipped_when_morning_touch_on", async () => {
  state.replaces = true;
  await deliverDailyDigests(new Date("2026-11-19T08:00:00Z"));
  expect(state.feedCalls).toBe(0);
});

test("the digest still runs while day_plan_touches is off", async () => {
  // The skip helper answers false for everybody while the flag is off.
  state.replaces = false;
  await deliverDailyDigests(new Date("2026-11-19T08:00:00Z"));
  expect(state.feedCalls).toBe(1);
});

test("the digest still runs when the morning touch is off", async () => {
  state.replaces = false;
  await deliverDailyDigests(new Date("2026-11-19T08:00:00Z"));
  expect(state.feedCalls).toBe(1);
});
