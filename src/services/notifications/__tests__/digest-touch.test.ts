import { deliverDailyDigests } from "../digest";

/** 08:30 in Zurich (UTC+1 in November); local midnight is 23:00Z the day before. */
const NOW = new Date("2026-11-19T07:30:00Z");

const state = {
  touchesOn: true,
  lastMorningAt: null as Date | null,
  digestTime: "08:00",
};
const pushed = jest.fn();
const emailed = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: {
    notificationSettings: {
      findMany: async () => [
        {
          userId: "u1",
          lastDigestAt: null,
          user: {
            email: "a@example.com",
            emailVerified: new Date(),
            pushSubscriptions: [{ id: "s1" }],
            nativePushTokens: [],
          },
        },
      ],
      updateMany: async () => ({ count: 1 }),
    },
    planSettings: {
      findUnique: async () => ({ lastMorningAt: state.lastMorningAt }),
    },
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock("@/lib/feature-flags", () => ({
  dayPlanTouchesEnabled: async () => state.touchesOn,
}));
jest.mock("@/lib/email/email-service", () => ({
  EmailService: { sendEmail: (...args: unknown[]) => emailed(...args) },
}));
jest.mock("@/lib/email/templates/notifications", () => ({
  getDigestTemplate: () => ({ subject: "s", html: "h", text: "t" }),
}));
jest.mock("@/lib/email/unsubscribe", () => ({ unsubscribeUrl: () => "u" }));
jest.mock("../preferences", () => ({
  digestDue: () => true,
  getNotificationPrefs: async () => ({
    channelPush: true,
    emailNotifications: true,
    digestTime: state.digestTime,
    timeZone: "Europe/Zurich",
  }),
  typeOfFeedKind: () => "mention",
}));
jest.mock("../feed", () => ({
  getNotificationFeed: async () => ({ items: [] }),
}));
jest.mock("../alerts", () => ({
  alertable: () => true,
  digestSummary: () => ({ title: "Digest", body: "2 new" }),
}));
jest.mock("@/services/push/targets", () => ({
  PUSH_TARGET_SELECT: {},
  pushConfigured: () => true,
  pushTargetsOf: (user: { pushSubscriptions: unknown[] }) =>
    user.pushSubscriptions,
  loadPushTargets: async () => [],
}));
jest.mock("@/services/reminders/reminder-delivery", () => ({
  deliverPush: (...args: unknown[]) => pushed(...args),
}));
jest.mock("@/services/channels/registry", () => ({
  configuredAdapters: () => [],
}));
jest.mock("@/services/channels/touch", () => ({ sendChannelTouch: jest.fn() }));
jest.mock("@/services/channels/render", () => ({
  buildTouchMessage: jest.fn(),
}));
jest.mock("@/services/day-plan/plan", () => ({
  getDayPlan: jest.fn(),
  buildDraft: jest.fn(),
  activateDayPlan: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  state.touchesOn = true;
  state.digestTime = "08:00";
  state.lastMorningAt = new Date("2026-11-19T07:00:30Z");
});

test("test_morning_digest_skipped_when_morning_touch_on", async () => {
  await deliverDailyDigests(NOW);
  expect(pushed).not.toHaveBeenCalled();
});

test("test_email_digest_never_skipped", async () => {
  await deliverDailyDigests(NOW);
  expect(pushed).not.toHaveBeenCalled();
  expect(emailed).toHaveBeenCalledTimes(1);
});

test.each([
  ["test_digest_kept_when_morning_touch_did_not_send", null, true, "08:00"],
  [
    "the touch was sent yesterday, not today",
    new Date("2026-11-18T07:00:30Z"),
    true,
    "08:00",
  ],
  ["day_plan_touches is off", new Date("2026-11-19T07:00:30Z"), false, "08:00"],
  [
    "a non-morning digest is never skipped",
    new Date("2026-11-19T07:00:30Z"),
    true,
    "18:00",
  ],
])("the digest push is kept when %s", async (_name, sent, on, time) => {
  state.lastMorningAt = sent;
  state.touchesOn = on;
  state.digestTime = time;
  await deliverDailyDigests(NOW);
  expect(pushed).toHaveBeenCalledTimes(1);
  expect(emailed).toHaveBeenCalledTimes(1);
});
