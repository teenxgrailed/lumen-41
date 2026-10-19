import { sweepCalDavFeeds } from "@/worker/caldav-sweep";

import { enqueueCalendarSync, enqueueReschedule } from "@/lib/queue/enqueue";

const syncQueue = { getJob: jest.fn(), add: jest.fn() };
const rescheduleQueue = { getJob: jest.fn(), add: jest.fn() };
const listFeeds = jest.fn();

jest.mock("@/lib/queue/queues", () => ({
  getCalendarSyncQueue: () => syncQueue,
  getRescheduleQueue: () => rescheduleQueue,
  getAccountLifecycleQueue: jest.fn(),
  getBugReportSyncQueue: jest.fn(),
  getFocusQueue: jest.fn(),
  getImportQueue: jest.fn(),
  getMailSyncQueue: jest.fn(),
  getReminderQueue: jest.fn(),
  getWebhookRenewQueue: jest.fn(),
}));
jest.mock("@/lib/calendar-db", () => ({
  listCalDavFeedIdsForSweep: () => listFeeds(),
}));
jest.mock("@/lib/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

function finishedJob(state: "completed" | "failed") {
  return {
    isCompleted: jest.fn().mockResolvedValue(state === "completed"),
    isFailed: jest.fn().mockResolvedValue(state === "failed"),
    remove: jest.fn().mockResolvedValue(undefined),
  };
}

function runningJob() {
  return {
    isCompleted: jest.fn().mockResolvedValue(false),
    isFailed: jest.fn().mockResolvedValue(false),
    remove: jest.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  process.env.REDIS_URL = "redis://localhost:6379";
  for (const queue of [syncQueue, rescheduleQueue]) {
    queue.getJob.mockReset().mockResolvedValue(null);
    queue.add.mockReset().mockResolvedValue({});
  }
  listFeeds.mockReset();
});

describe("calendar sync enqueue", () => {
  it("adds the job under the feed id", async () => {
    await enqueueCalendarSync("feed-1");
    expect(syncQueue.add).toHaveBeenCalledWith(
      "sync-feed",
      { feedId: "feed-1" },
      { jobId: "calendar-sync-feed-1" }
    );
  });

  it.each(["completed", "failed"] as const)(
    "drops a %s job first, so the same id is not ignored for ever",
    async (state) => {
      const job = finishedJob(state);
      syncQueue.getJob.mockResolvedValue(job);
      await enqueueCalendarSync("feed-1");
      expect(syncQueue.getJob).toHaveBeenCalledWith("calendar-sync-feed-1");
      expect(job.remove).toHaveBeenCalledTimes(1);
      expect(syncQueue.add).toHaveBeenCalledTimes(1);
    }
  );

  it("leaves a job that is still waiting or running alone", async () => {
    const job = runningJob();
    syncQueue.getJob.mockResolvedValue(job);
    await enqueueCalendarSync("feed-1");
    expect(job.remove).not.toHaveBeenCalled();
    expect(syncQueue.add).toHaveBeenCalledTimes(1);
  });

  it("clears a finished reschedule job the same way", async () => {
    const job = finishedJob("completed");
    rescheduleQueue.getJob.mockResolvedValue(job);
    await enqueueReschedule("user-1");
    expect(rescheduleQueue.getJob).toHaveBeenCalledWith("reschedule-user-1");
    expect(job.remove).toHaveBeenCalledTimes(1);
  });
});

describe("CalDAV sweep", () => {
  it("queues one sync per CalDAV feed", async () => {
    listFeeds.mockResolvedValue(["a", "b", "c"]);
    await expect(sweepCalDavFeeds()).resolves.toBe(3);
    expect(syncQueue.add.mock.calls.map((c) => c[1])).toEqual([
      { feedId: "a" },
      { feedId: "b" },
      { feedId: "c" },
    ]);
  });

  it("queues nothing when there are no CalDAV feeds", async () => {
    listFeeds.mockResolvedValue([]);
    await expect(sweepCalDavFeeds()).resolves.toBe(0);
    expect(syncQueue.add).not.toHaveBeenCalled();
  });
});
