import {
  deleteCalendarWebhook,
  getCalendarFeedForSync,
  getCalendarWebhookForFeed,
  markCalendarFeedPushUnsupported,
} from "@/lib/calendar-db";
import {
  GoogleWatchIneligibleError,
  GoogleWatchUnsupportedError,
  isGoogleWatchPermanentRefusal,
  registerGoogleWatch,
} from "@/lib/calendar-webhooks/google";
import { getGoogleCalendarClient } from "@/lib/google-calendar";

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/calendar-db", () => ({
  deleteCalendarWebhook: jest.fn(),
  getCalendarFeedForSync: jest.fn(),
  getCalendarWebhookForFeed: jest.fn(),
  markCalendarFeedPushUnsupported: jest.fn(),
  upsertCalendarWebhook: jest.fn(),
}));
jest.mock("@/lib/calendar-webhooks/config", () => ({
  getWebhookBaseUrl: () => "https://example.test",
}));
jest.mock("@/lib/google-calendar", () => ({
  getGoogleCalendarClient: jest.fn(),
}));

const pushUnsupported = Object.assign(
  new Error("Push notifications are not supported by this resource."),
  {
    code: 400,
    errors: [{ reason: "pushNotSupportedForRequestedResource" }],
  }
);

const eligibleFeed = {
  type: "GOOGLE",
  url: "cal",
  accountId: "a",
  userId: "u",
  enabled: true,
};

describe("isGoogleWatchPermanentRefusal", () => {
  it("recognises pushNotSupportedForRequestedResource", () => {
    expect(isGoogleWatchPermanentRefusal(pushUnsupported)).toBe(true);
    expect(
      isGoogleWatchPermanentRefusal({
        response: {
          status: 400,
          data: {
            error: {
              errors: [{ reason: "pushNotSupportedForRequestedResource" }],
            },
          },
        },
      })
    ).toBe(true);
  });

  it("recognises a deleted calendar (404)", () => {
    expect(isGoogleWatchPermanentRefusal({ code: 404 })).toBe(true);
  });

  it("does not swallow unexpected errors", () => {
    expect(isGoogleWatchPermanentRefusal({ code: 500 })).toBe(false);
    expect(
      isGoogleWatchPermanentRefusal({
        code: 403,
        errors: [{ reason: "rateLimitExceeded" }],
      })
    ).toBe(false);
    expect(isGoogleWatchPermanentRefusal(new Error("boom"))).toBe(false);
    expect(isGoogleWatchPermanentRefusal(null)).toBe(false);
  });
});

describe("registerGoogleWatch", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCalendarWebhookForFeed as jest.Mock).mockResolvedValue(null);
  });

  it("throws the typed ineligible error for a disabled feed", async () => {
    (getCalendarFeedForSync as jest.Mock).mockResolvedValue({
      ...eligibleFeed,
      enabled: false,
    });
    await expect(registerGoogleWatch("f")).rejects.toBeInstanceOf(
      GoogleWatchIneligibleError
    );
  });

  it("marks the feed when Google refuses push, and throws the typed error", async () => {
    (getCalendarFeedForSync as jest.Mock).mockResolvedValue(eligibleFeed);
    (getGoogleCalendarClient as jest.Mock).mockResolvedValue({
      events: { watch: jest.fn().mockRejectedValue(pushUnsupported) },
    });
    await expect(registerGoogleWatch("f")).rejects.toBeInstanceOf(
      GoogleWatchUnsupportedError
    );
    expect(markCalendarFeedPushUnsupported).toHaveBeenCalledWith("f");
    expect(deleteCalendarWebhook).not.toHaveBeenCalled();
  });

  it("rethrows unexpected Google errors without marking", async () => {
    (getCalendarFeedForSync as jest.Mock).mockResolvedValue(eligibleFeed);
    const server = Object.assign(new Error("backend"), { code: 500 });
    (getGoogleCalendarClient as jest.Mock).mockResolvedValue({
      events: { watch: jest.fn().mockRejectedValue(server) },
    });
    await expect(registerGoogleWatch("f")).rejects.toBe(server);
    expect(markCalendarFeedPushUnsupported).not.toHaveBeenCalled();
  });
});
