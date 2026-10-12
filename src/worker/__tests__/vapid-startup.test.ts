import { startWorkerHealthServer } from "@/worker/health-server";
import { runWorkerStartupChecks } from "@/worker/startup";

import { getWebhookRenewQueue } from "@/lib/queue/queues";

jest.mock("@/services/bug-reports/bug-report-service", () => ({
  syncBugReportToGithub: jest.fn(),
}));
jest.mock("@/services/nudges/proactive-assist", () => ({
  generateProactiveNudges: jest.fn(),
}));
jest.mock("@/services/operations/health", () => ({
  collectOperationsHealth: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/services/reminders/reminder-delivery", () => ({
  deliverTaskReminder: jest.fn(),
  findDueReminderIds: jest.fn().mockResolvedValue([]),
}));
jest.mock("@/services/scheduling/TaskSchedulingService", () => ({
  scheduleAllTasksForUser: jest.fn(),
}));
jest.mock("@/services/scheduling/runs", () => ({
  executeSchedulingRun: jest.fn(),
}));
jest.mock("@/worker/health-server", () => ({
  startWorkerHealthServer: jest.fn().mockResolvedValue(undefined),
  stopWorkerHealthServer: jest.fn(),
}));
jest.mock("@/worker/startup", () => ({
  runWorkerStartupChecks: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@sentry/node", () => ({
  init: jest.fn(),
  withScope: jest.fn(),
  captureException: jest.fn(),
}));
jest.mock("bullmq", () => ({
  Worker: jest.fn().mockImplementation((name: string) => ({
    name,
    on: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
  })),
}));
jest.mock("@/lib/caldav-calendar", () => ({
  CalDAVCalendarService: jest.fn(),
}));
jest.mock("@/lib/calendar-db", () => ({
  getCalendarFeedForSync: jest.fn(),
  updateCalendarFeedSyncState: jest.fn(),
}));
jest.mock("@/lib/calendar-webhooks/renew", () => ({
  renewCalendarWebhooks: jest.fn(),
}));
jest.mock("@/lib/date-utils", () => ({
  newDate: jest.fn(() => new Date("2026-08-25T00:00:00.000Z")),
}));
jest.mock("@/lib/google-sync", () => ({ syncGoogleCalendar: jest.fn() }));
jest.mock("@/lib/health/build-sha", () => ({
  isGitBuildSha: jest.fn(() => false),
  requireProductionBuildSha: jest.fn(() => "test-build"),
}));
jest.mock("@/lib/health/worker-release", () => ({
  WORKER_RELEASE_HEARTBEAT_INTERVAL_MS: 60_000,
  recordWorkerReleaseHeartbeat: jest.fn(),
  removeWorkerReleaseHeartbeat: jest.fn(),
}));
jest.mock("@/lib/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn().mockResolvedValue(undefined),
    warn: jest.fn(),
    error: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock("@/lib/mail-db", () => ({
  listActiveMailAccountIds: jest.fn().mockResolvedValue([]),
}));
jest.mock("@/lib/mail/imap-idle", () => ({
  closeImapIdleWatchers: jest.fn(),
  ensureImapIdleWatcher: jest.fn(),
}));
jest.mock("@/lib/mail/sync", () => ({ syncMailAccount: jest.fn() }));
jest.mock("@/lib/outlook-calendar", () => ({ getOutlookClient: jest.fn() }));
jest.mock("@/lib/outlook-sync", () => ({ syncOutlookCalendar: jest.fn() }));
jest.mock("@/lib/queue/connection", () => ({
  closeRedisConnection: jest.fn(),
  getRedisConnection: jest.fn(() => ({})),
}));
jest.mock("@/lib/queue/enqueue", () => ({
  enqueueReminderDelivery: jest.fn(),
  enqueueReschedule: jest.fn(),
  enqueueWebhookRenew: jest.fn().mockResolvedValue(undefined),
  ensureMailSyncSchedule: jest.fn(),
}));
jest.mock("@/lib/queue/queues", () => {
  const queue = {
    upsertJobScheduler: jest.fn().mockResolvedValue(undefined),
  };
  return {
    closeQueues: jest.fn(),
    getBugReportSyncQueue: jest.fn(() => queue),
    getNudgeQueue: jest.fn(() => queue),
    getReminderQueue: jest.fn(() => queue),
    getLifetimeCheckoutReconciliationQueue: jest.fn(() => queue),
    getTrialQueue: jest.fn(() => queue),
    getAccountLifecycleQueue: jest.fn(() => queue),
    getWebhookRenewQueue: jest.fn(() => queue),
  };
});
jest.mock("@/lib/realtime/publish", () => ({
  publishRealtimeEvent: jest.fn(),
}));
jest.mock("@/lib/sentry/privacy", () => ({
  dropSentryBreadcrumb: jest.fn(),
  scrubSentryEvent: jest.fn(),
  scrubSentrySpan: jest.fn(),
}));

const mockRunWorkerStartupChecks = jest.mocked(runWorkerStartupChecks);
const mockGetWebhookRenewQueue = jest.mocked(getWebhookRenewQueue);
const mockStartWorkerHealthServer = jest.mocked(startWorkerHealthServer);

describe("worker VAPID startup warning", () => {
  it("executes the VAPID check from the real worker start before queue setup", async () => {
    jest.useFakeTimers();
    const processOnce = jest.spyOn(process, "once").mockReturnValue(process);
    try {
      const { start } = await import("@/worker/index");

      await start();

      expect(mockRunWorkerStartupChecks).toHaveBeenCalledTimes(1);
      expect(
        mockRunWorkerStartupChecks.mock.invocationCallOrder[0]
      ).toBeLessThan(mockGetWebhookRenewQueue.mock.invocationCallOrder[0]);
    } finally {
      processOnce.mockRestore();
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });

  it("listens for health checks before the slow startup work", async () => {
    jest.useFakeTimers();
    const processOnce = jest.spyOn(process, "once").mockReturnValue(process);
    try {
      const { start } = await import("@/worker/index");

      await start();

      const listened =
        mockStartWorkerHealthServer.mock.invocationCallOrder.at(-1)!;
      expect(listened).toBeLessThan(
        mockRunWorkerStartupChecks.mock.invocationCallOrder.at(-1)!
      );
      expect(listened).toBeLessThan(
        mockGetWebhookRenewQueue.mock.invocationCallOrder.at(-1)!
      );
    } finally {
      processOnce.mockRestore();
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });
});
