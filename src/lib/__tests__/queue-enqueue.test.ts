import {
  enqueueCalendarSync,
  enqueueMailSync,
  enqueueReschedule,
  enqueueWebhookRenew,
} from "@/lib/queue/enqueue";

const calendarAdd = jest.fn();
const rescheduleAdd = jest.fn();
const renewAdd = jest.fn();
const mailAdd = jest.fn();
const getJob = jest.fn();

jest.mock("@/lib/queue/queues", () => ({
  getCalendarSyncQueue: () => ({ add: calendarAdd, getJob }),
  getRescheduleQueue: () => ({ add: rescheduleAdd, getJob }),
  getWebhookRenewQueue: () => ({ add: renewAdd }),
  getMailSyncQueue: () => ({ add: mailAdd }),
}));

describe("queue enqueue helpers", () => {
  const originalRedisUrl = process.env.REDIS_URL;

  beforeEach(() => {
    jest.clearAllMocks();
    getJob.mockResolvedValue(null);
    process.env.REDIS_URL = "redis://localhost:6379";
  });

  afterAll(() => {
    if (originalRedisUrl === undefined) {
      delete process.env.REDIS_URL;
    } else {
      process.env.REDIS_URL = originalRedisUrl;
    }
  });

  test("deduplicates calendar sync jobs by feed", async () => {
    await enqueueCalendarSync("feed-123");
    expect(calendarAdd).toHaveBeenCalledWith(
      "sync-feed",
      { feedId: "feed-123" },
      { jobId: "calendar-sync-feed-123" }
    );
  });

  test("deduplicates rescheduling by user", async () => {
    await enqueueReschedule("user-123");
    expect(rescheduleAdd).toHaveBeenCalledWith(
      "reschedule-user",
      { userId: "user-123" },
      { jobId: "reschedule-user-123" }
    );
  });

  test("deduplicates mail sync jobs by account", async () => {
    await enqueueMailSync("account-123");
    expect(mailAdd).toHaveBeenCalledWith(
      "sync-account",
      { accountId: "account-123" },
      {
        jobId: "mail-sync-account-123",
        removeOnComplete: true,
        removeOnFail: 50,
      }
    );
  });

  test("scopes explicit webhook renewals to provider and feed", async () => {
    await enqueueWebhookRenew({ provider: "GOOGLE", feedId: "feed-123" });
    expect(renewAdd).toHaveBeenCalledWith(
      "renew-webhooks",
      { provider: "GOOGLE", feedId: "feed-123" },
      { jobId: "webhook-renew-GOOGLE-feed-123" }
    );
  });

  test("treats a missing Redis URL as an optional web-process integration", async () => {
    delete process.env.REDIS_URL;

    await expect(enqueueCalendarSync("feed-123")).resolves.toBeNull();
    await expect(enqueueMailSync("account-123")).resolves.toBeNull();
    expect(calendarAdd).not.toHaveBeenCalled();
    expect(mailAdd).not.toHaveBeenCalled();
  });
});
