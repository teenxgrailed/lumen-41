import {
  clearCalendarFeedPushUnsupported,
  getCalendarFeedForSync,
  getCalendarWebhookForFeed,
  markCalendarFeedPushUnsupported,
  upsertCalendarWebhook,
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
  clearCalendarFeedPushUnsupported: jest.fn(),
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

  it("recognises a deleted calendar (404 with reason notFound)", () => {
    expect(
      isGoogleWatchPermanentRefusal({
        code: 404,
        errors: [{ reason: "notFound" }],
      })
    ).toBe(true);
  });

  it("treats a bare 404 as an ordinary failure", () => {
    expect(isGoogleWatchPermanentRefusal({ code: 404 })).toBe(false);
    expect(
      isGoogleWatchPermanentRefusal({
        code: 404,
        errors: [{ reason: "somethingElse" }],
      })
    ).toBe(false);
  });

  it("recognises the 400 message fallback only on status 400", () => {
    const message = "Push notifications are not supported by this resource.";
    expect(
      isGoogleWatchPermanentRefusal(
        Object.assign(new Error(message), { code: 400 })
      )
    ).toBe(true);
    expect(
      isGoogleWatchPermanentRefusal(
        Object.assign(new Error(message), { code: 500 })
      )
    ).toBe(false);
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
    expect(upsertCalendarWebhook).not.toHaveBeenCalled();
  });

  it("stops an existing channel before marking on refusal", async () => {
    (getCalendarFeedForSync as jest.Mock).mockResolvedValue(eligibleFeed);
    const stop = jest.fn().mockResolvedValue({});
    (getGoogleCalendarClient as jest.Mock).mockResolvedValue({
      events: { watch: jest.fn().mockRejectedValue(pushUnsupported) },
      channels: { stop },
    });
    (getCalendarWebhookForFeed as jest.Mock).mockResolvedValue({
      channelId: "ch",
      resourceId: "res",
      feed: { accountId: "a", userId: "u" },
    });
    await expect(registerGoogleWatch("f")).rejects.toBeInstanceOf(
      GoogleWatchUnsupportedError
    );
    expect(stop).toHaveBeenCalledWith(
      { requestBody: { id: "ch", resourceId: "res" } },
      {}
    );
    expect(markCalendarFeedPushUnsupported).toHaveBeenCalledWith("f");
  });

  it("still marks the feed when stopping the channel fails", async () => {
    (getCalendarFeedForSync as jest.Mock).mockResolvedValue(eligibleFeed);
    (getGoogleCalendarClient as jest.Mock).mockResolvedValue({
      events: { watch: jest.fn().mockRejectedValue(pushUnsupported) },
      channels: { stop: jest.fn().mockRejectedValue(new Error("gone")) },
    });
    (getCalendarWebhookForFeed as jest.Mock).mockResolvedValue({
      channelId: "ch",
      resourceId: "res",
      feed: { accountId: "a", userId: "u" },
    });
    await expect(registerGoogleWatch("f")).rejects.toBeInstanceOf(
      GoogleWatchUnsupportedError
    );
    expect(markCalendarFeedPushUnsupported).toHaveBeenCalledWith("f");
  });

  it("does not mark on a bare 404", async () => {
    (getCalendarFeedForSync as jest.Mock).mockResolvedValue(eligibleFeed);
    const bare = Object.assign(new Error("Not Found"), { code: 404 });
    (getGoogleCalendarClient as jest.Mock).mockResolvedValue({
      events: { watch: jest.fn().mockRejectedValue(bare) },
    });
    await expect(registerGoogleWatch("f")).rejects.toBe(bare);
    expect(markCalendarFeedPushUnsupported).not.toHaveBeenCalled();
  });

  it("clears the mark when a marked feed registers successfully", async () => {
    (getCalendarFeedForSync as jest.Mock).mockResolvedValue({
      ...eligibleFeed,
      pushUnsupportedAt: new Date(),
    });
    (getGoogleCalendarClient as jest.Mock).mockResolvedValue({
      events: {
        watch: jest.fn().mockResolvedValue({
          data: { resourceId: "res", expiration: String(Date.now() + 1000) },
        }),
      },
    });
    (upsertCalendarWebhook as jest.Mock).mockResolvedValue({ id: "w" });
    await registerGoogleWatch("f");
    expect(upsertCalendarWebhook).toHaveBeenCalled();
    expect(clearCalendarFeedPushUnsupported).toHaveBeenCalledWith("f");
  });

  it("does not touch the flag for an unmarked feed", async () => {
    (getCalendarFeedForSync as jest.Mock).mockResolvedValue({
      ...eligibleFeed,
      pushUnsupportedAt: null,
    });
    (getGoogleCalendarClient as jest.Mock).mockResolvedValue({
      events: {
        watch: jest.fn().mockResolvedValue({ data: { resourceId: "res" } }),
      },
    });
    (upsertCalendarWebhook as jest.Mock).mockResolvedValue({ id: "w" });
    await registerGoogleWatch("f");
    expect(clearCalendarFeedPushUnsupported).not.toHaveBeenCalled();
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
