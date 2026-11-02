import {
  listCalendarWebhooks,
  listPushEnabledCalendarFeeds,
} from "@/lib/calendar-db";
import { registerGoogleWatch } from "@/lib/calendar-webhooks/google";
import { renewOutlookSubscription } from "@/lib/calendar-webhooks/outlook";
import { renewCalendarWebhooks } from "@/lib/calendar-webhooks/renew";

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/calendar-db", () => ({
  listCalendarWebhooks: jest.fn(),
  listPushEnabledCalendarFeeds: jest.fn(),
}));
jest.mock("@/lib/calendar-webhooks/google", () => ({
  registerGoogleWatch: jest.fn(),
}));
jest.mock("@/lib/calendar-webhooks/outlook", () => ({
  registerOutlookSubscription: jest.fn(),
  renewOutlookSubscription: jest.fn(),
}));

const soon = new Date(Date.now() + 60_000);

describe("renewCalendarWebhooks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

    await expect(renewCalendarWebhooks()).rejects.toThrow(
      /1 feed\(s\): bad.*revoked/
    );
    expect(registerGoogleWatch).toHaveBeenCalledWith("good-g");
    expect(renewOutlookSubscription).toHaveBeenCalledWith("good-o");
  });

  it("returns the results when nothing fails", async () => {
    (listCalendarWebhooks as jest.Mock).mockResolvedValue([
      { feedId: "a", provider: "GOOGLE", expiration: soon },
    ]);
    await expect(renewCalendarWebhooks()).resolves.toEqual([
      { feedId: "a", provider: "GOOGLE", renewed: true },
    ]);
  });
});
