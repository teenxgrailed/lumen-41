import {
  listCalendarWebhooks,
  listPushEnabledCalendarFeeds,
  recordCalendarFeedSyncFailure,
} from "@/lib/calendar-db";
import {
  GoogleWatchIneligibleError,
  GoogleWatchUnsupportedError,
  disableGoogleWatch,
  registerGoogleWatch,
} from "@/lib/calendar-webhooks/google";
import { renewOutlookSubscription } from "@/lib/calendar-webhooks/outlook";
import { registerOutlookSubscription } from "@/lib/calendar-webhooks/outlook";
import {
  CalendarWebhookRenewalError,
  renewCalendarWebhooks,
} from "@/lib/calendar-webhooks/renew";

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/calendar-db", () => ({
  listCalendarWebhooks: jest.fn(),
  listPushEnabledCalendarFeeds: jest.fn(),
  recordCalendarFeedSyncFailure: jest.fn(),
}));
jest.mock("@/lib/calendar-webhooks/google", () => {
  class GoogleWatchIneligibleError extends Error {}
  class GoogleWatchUnsupportedError extends Error {}
  return {
    GoogleWatchIneligibleError,
    GoogleWatchUnsupportedError,
    disableGoogleWatch: jest.fn(),
    registerGoogleWatch: jest.fn(),
  };
});
jest.mock("@/lib/calendar-webhooks/outlook", () => ({
  registerOutlookSubscription: jest.fn(),
  renewOutlookSubscription: jest.fn(),
}));

const soon = new Date(Date.now() + 60_000);

describe("renewCalendarWebhooks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (registerGoogleWatch as jest.Mock).mockReset();
    (listPushEnabledCalendarFeeds as jest.Mock).mockResolvedValue([]);
  });

  it("keeps renewing the other feeds after one fails, then throws once at the end", async () => {
    (listCalendarWebhooks as jest.Mock).mockResolvedValue([
      { feedId: "bad", provider: "GOOGLE", expiration: soon },
      { feedId: "good-g", provider: "GOOGLE", expiration: soon },
      { feedId: "good-o", provider: "OUTLOOK", expiration: soon },
    ]);
    (registerGoogleWatch as jest.Mock).mockImplementation(async (id) => {
      if (id === "bad") throw new Error("revoked");
    });

    const error = await renewCalendarWebhooks().catch((e) => e);
    expect(error).toBeInstanceOf(CalendarWebhookRenewalError);
    expect(error.name).toBe("CalendarWebhookRenewalError");
    expect(error.message).toBe("Calendar webhook renewal failed for 1 feed(s)");
    expect(recordCalendarFeedSyncFailure).not.toHaveBeenCalled();
    expect(registerGoogleWatch).toHaveBeenCalledWith("good-g");
    expect(renewOutlookSubscription).toHaveBeenCalledWith("good-o");
  });

  it("does not throw for a calendar Google cannot push for", async () => {
    (listCalendarWebhooks as jest.Mock).mockResolvedValue([
      { feedId: "holidays", provider: "GOOGLE", expiration: soon },
    ]);
    (registerGoogleWatch as jest.Mock).mockRejectedValue(
      new GoogleWatchUnsupportedError()
    );
    await expect(renewCalendarWebhooks()).resolves.toEqual([]);
  });

  it("does not throw for an ineligible feed while registering a missing watch", async () => {
    (listCalendarWebhooks as jest.Mock).mockResolvedValue([]);
    (listPushEnabledCalendarFeeds as jest.Mock).mockResolvedValue([
      { id: "x", type: "GOOGLE", webhooks: [], nextSyncAttemptAt: null },
    ]);
    (registerGoogleWatch as jest.Mock).mockRejectedValue(
      new GoogleWatchIneligibleError()
    );
    await expect(renewCalendarWebhooks()).resolves.toEqual([]);
  });

  it("cleans up disabled and push-unsupported feeds instead of renewing them", async () => {
    (listCalendarWebhooks as jest.Mock).mockResolvedValue([
      {
        feedId: "off",
        provider: "GOOGLE",
        expiration: soon,
        feed: { enabled: false, pushUnsupportedAt: null },
      },
      {
        feedId: "marked",
        provider: "GOOGLE",
        expiration: soon,
        feed: { enabled: true, pushUnsupportedAt: new Date() },
      },
    ]);
    await expect(renewCalendarWebhooks()).resolves.toEqual([
      { feedId: "off", provider: "GOOGLE", renewed: false },
      { feedId: "marked", provider: "GOOGLE", renewed: false },
    ]);
    expect(registerGoogleWatch).not.toHaveBeenCalled();
    expect(disableGoogleWatch).toHaveBeenCalledTimes(2);
    expect(disableGoogleWatch).toHaveBeenCalledWith("off");
    expect(disableGoogleWatch).toHaveBeenCalledWith("marked");
  });

  it("attempts registration on a forced renew of a marked feed", async () => {
    (listCalendarWebhooks as jest.Mock).mockResolvedValue([]);
    await renewCalendarWebhooks({ provider: "GOOGLE", feedId: "marked" });
    expect(registerGoogleWatch).toHaveBeenCalledWith("marked");
    expect(disableGoogleWatch).not.toHaveBeenCalled();
  });

  it("attempts registration on a forced renew when a row still exists", async () => {
    (listCalendarWebhooks as jest.Mock).mockResolvedValue([
      {
        feedId: "marked",
        provider: "GOOGLE",
        expiration: new Date(Date.now() + 10 * 86_400_000),
        feed: { enabled: true, pushUnsupportedAt: new Date() },
      },
    ]);
    await renewCalendarWebhooks({ provider: "GOOGLE", feedId: "marked" });
    expect(registerGoogleWatch).toHaveBeenCalledWith("marked");
    expect(disableGoogleWatch).not.toHaveBeenCalled();
  });

  it("returns the results when nothing fails", async () => {
    (listCalendarWebhooks as jest.Mock).mockResolvedValue([
      { feedId: "a", provider: "GOOGLE", expiration: soon },
    ]);
    await expect(renewCalendarWebhooks()).resolves.toEqual([
      { feedId: "a", provider: "GOOGLE", renewed: true },
    ]);
  });

  it("records a revoked token as needs-reconnect and does not throw", async () => {
    (listCalendarWebhooks as jest.Mock).mockResolvedValue([
      { feedId: "revoked", provider: "GOOGLE", expiration: soon },
      { feedId: "good-o", provider: "OUTLOOK", expiration: soon },
    ]);
    const revoked = Object.assign(new Error("invalid_grant"), {
      code: "invalid_grant",
    });
    (registerGoogleWatch as jest.Mock).mockRejectedValue(revoked);

    await expect(renewCalendarWebhooks()).resolves.toEqual([
      { feedId: "good-o", provider: "OUTLOOK", renewed: true },
    ]);
    expect(recordCalendarFeedSyncFailure).toHaveBeenCalledWith(
      "revoked",
      revoked
    );
  });

  it("treats a revoked token while registering a missing watch the same way", async () => {
    (listCalendarWebhooks as jest.Mock).mockResolvedValue([]);
    (listPushEnabledCalendarFeeds as jest.Mock).mockResolvedValue([
      { id: "new", type: "OUTLOOK", webhooks: [], nextSyncAttemptAt: null },
    ]);
    const unauthorized = Object.assign(new Error("nope"), { status: 401 });
    (registerOutlookSubscription as jest.Mock).mockRejectedValue(unauthorized);

    await expect(renewCalendarWebhooks()).resolves.toEqual([]);
    expect(recordCalendarFeedSyncFailure).toHaveBeenCalledWith(
      "new",
      unauthorized
    );
  });

  it("skips feeds that are backing off in both loops", async () => {
    const later = new Date(Date.now() + 3_600_000);
    (listCalendarWebhooks as jest.Mock).mockResolvedValue([
      {
        feedId: "waiting",
        provider: "GOOGLE",
        expiration: soon,
        feed: { nextSyncAttemptAt: later },
      },
    ]);
    (listPushEnabledCalendarFeeds as jest.Mock).mockResolvedValue([
      {
        id: "waiting-new",
        type: "OUTLOOK",
        webhooks: [],
        nextSyncAttemptAt: later,
      },
    ]);

    await renewCalendarWebhooks();
    expect(registerGoogleWatch).not.toHaveBeenCalled();
    expect(registerOutlookSubscription).not.toHaveBeenCalled();
  });
});
