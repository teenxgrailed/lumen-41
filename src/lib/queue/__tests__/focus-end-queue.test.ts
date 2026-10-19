import { syncFocusEndJob } from "@/services/focus/focus-end-job";
import { FocusSessionPhase } from "@prisma/client";

import { cancelFocusEnd, scheduleFocusEnd } from "@/lib/queue/enqueue";

const queue = { getJob: jest.fn(), add: jest.fn() };

jest.mock("@/lib/queue/queues", () => ({
  getFocusQueue: () => queue,
  getAccountLifecycleQueue: jest.fn(),
  getBugReportSyncQueue: jest.fn(),
  getCalendarSyncQueue: jest.fn(),
  getImportQueue: jest.fn(),
  getMailSyncQueue: jest.fn(),
  getReminderQueue: jest.fn(),
  getRescheduleQueue: jest.fn(),
  getWebhookRenewQueue: jest.fn(),
}));

jest.mock("@/lib/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const NOW = new Date("2026-10-19T10:00:00.000Z");

function session(over: Record<string, unknown> = {}) {
  return {
    id: "s1",
    startedAt: NOW,
    endedAt: null,
    pausedAt: null,
    pausedTotalSeconds: 0,
    plannedMinutes: 25,
    phase: FocusSessionPhase.FOCUS,
    ...over,
  } as Parameters<typeof syncFocusEndJob>[0];
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW);
  process.env.REDIS_URL = "redis://localhost:6379";
  queue.getJob.mockReset().mockResolvedValue(null);
  queue.add.mockReset().mockResolvedValue({});
});

afterEach(() => {
  jest.useRealTimers();
});

describe("focus end job", () => {
  it("schedules one delayed job under the session id", async () => {
    await scheduleFocusEnd("s1", new Date(NOW.getTime() + 25 * 60_000));
    expect(queue.add).toHaveBeenCalledWith(
      "focus-ended",
      { kind: "ended", sessionId: "s1" },
      expect.objectContaining({
        jobId: "focus-end-s1",
        delay: 25 * 60_000,
      })
    );
  });

  it("replaces a queued job instead of adding a second one", async () => {
    const remove = jest.fn().mockResolvedValue(undefined);
    queue.getJob.mockResolvedValue({ remove });
    await scheduleFocusEnd("s1", new Date(NOW.getTime() + 60_000));
    expect(remove).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it("cancels the queued job, and does nothing when there is none", async () => {
    const remove = jest.fn().mockResolvedValue(undefined);
    queue.getJob.mockResolvedValueOnce({ remove });
    await expect(cancelFocusEnd("s1")).resolves.toBe(true);
    expect(remove).toHaveBeenCalled();
    await expect(cancelFocusEnd("s1")).resolves.toBe(false);
  });

  it("does nothing without Redis", async () => {
    delete process.env.REDIS_URL;
    await scheduleFocusEnd("s1", NOW);
    expect(queue.add).not.toHaveBeenCalled();
  });
});

describe("syncFocusEndJob follows the session", () => {
  const removeJob = () => {
    const remove = jest.fn().mockResolvedValue(undefined);
    queue.getJob.mockResolvedValue({ remove });
    return remove;
  };

  it("start: schedules at the planned end", async () => {
    await syncFocusEndJob(session());
    expect(queue.add.mock.calls[0][2].delay).toBe(25 * 60_000);
  });

  it("pause: cancels, a paused session has no end", async () => {
    const remove = removeJob();
    await syncFocusEndJob(session({ pausedAt: NOW }));
    expect(remove).toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it("resume: schedules again for what is left after the pause", async () => {
    await syncFocusEndJob(
      session({
        startedAt: new Date(NOW.getTime() - 10 * 60_000),
        pausedTotalSeconds: 300,
      })
    );
    expect(queue.add.mock.calls[0][2].delay).toBe(20 * 60_000);
  });

  it("extend: moves the job to the new end", async () => {
    removeJob();
    await syncFocusEndJob(session({ plannedMinutes: 35 }));
    expect(queue.add.mock.calls[0][2].delay).toBe(35 * 60_000);
  });

  it("ended early: cancels", async () => {
    const remove = removeJob();
    await syncFocusEndJob(session({ endedAt: NOW }));
    expect(remove).toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it("breaks and open-ended sessions get no job", async () => {
    await syncFocusEndJob(session({ phase: FocusSessionPhase.SHORT_BREAK }));
    await syncFocusEndJob(session({ plannedMinutes: null }));
    expect(queue.add).not.toHaveBeenCalled();
  });

  it("a queue failure never fails the caller", async () => {
    queue.add.mockRejectedValue(new Error("redis down"));
    await expect(syncFocusEndJob(session())).resolves.toBeUndefined();
  });
});
