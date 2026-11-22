/** @jest-environment node */
import { describeFailedJob, processMailSyncJob } from "@/worker/mail-sync";
import { type Job, UnrecoverableError } from "bullmq";

import { sanitizeLogMetadata } from "@/lib/logger/sanitize";
import {
  getMailAccountSyncError,
  pauseMailAccountSync,
  recordMailSyncError,
} from "@/lib/mail-db";
import { syncMailAccount } from "@/lib/mail/sync";
import {
  MailAuthError,
  MailTokenUnavailableError,
} from "@/lib/mail/sync-failure";
import { removeMailSyncSchedule } from "@/lib/queue/enqueue";

jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/mail/imap-idle", () => ({
  ensureImapIdleWatcher: jest.fn(),
}));
jest.mock("@/lib/mail/sync", () => ({ syncMailAccount: jest.fn() }));
jest.mock("@/lib/mail-db", () => ({
  getMailAccountSyncError: jest.fn(),
  pauseMailAccountSync: jest.fn(),
  recordMailSyncError: jest.fn(),
}));
jest.mock("@/lib/queue/enqueue", () => ({ removeMailSyncSchedule: jest.fn() }));

function job(attemptsMade = 0, attempts = 4) {
  return {
    id: "repeat:mail-sync-account-acc1:1",
    name: "sync-account",
    data: { accountId: "acc1" },
    attemptsMade,
    opts: { attempts },
  } as unknown as Job<{ accountId: string }>;
}

beforeEach(() => jest.clearAllMocks());

describe("processMailSyncJob", () => {
  it("auth failure: no retry, account flagged, repeat job removed", async () => {
    jest
      .mocked(syncMailAccount)
      .mockRejectedValue(new Error("Bad: invalid_grant"));
    await expect(processMailSyncJob(job())).rejects.toBeInstanceOf(
      UnrecoverableError
    );
    expect(pauseMailAccountSync).toHaveBeenCalledWith("acc1", "auth");
    expect(removeMailSyncSchedule).toHaveBeenCalledWith("acc1");
  });

  it("treats a refused IMAP login and a 401 as auth", async () => {
    jest
      .mocked(syncMailAccount)
      .mockRejectedValueOnce(
        Object.assign(new Error("Command failed"), {
          authenticationFailed: true,
        })
      )
      .mockRejectedValueOnce(
        new MailAuthError("IMAP credentials are invalid.")
      );
    await expect(processMailSyncJob(job())).rejects.toBeInstanceOf(
      UnrecoverableError
    );
    await expect(processMailSyncJob(job())).rejects.toBeInstanceOf(
      UnrecoverableError
    );
    expect(pauseMailAccountSync).toHaveBeenCalledTimes(2);
  });

  it("transient error: rethrown for retry, nothing paused", async () => {
    const error = new Error("socket hang up");
    jest.mocked(syncMailAccount).mockRejectedValue(error);
    await expect(processMailSyncJob(job())).rejects.toBe(error);
    expect(pauseMailAccountSync).not.toHaveBeenCalled();
    expect(removeMailSyncSchedule).not.toHaveBeenCalled();
  });

  it("missing token: retried, noted on the last attempt, paused on the second run", async () => {
    jest
      .mocked(syncMailAccount)
      .mockRejectedValue(new MailTokenUnavailableError());
    await expect(processMailSyncJob(job(0))).rejects.not.toBeInstanceOf(
      UnrecoverableError
    );
    expect(recordMailSyncError).not.toHaveBeenCalled();

    jest.mocked(getMailAccountSyncError).mockResolvedValue(null);
    await expect(processMailSyncJob(job(3))).rejects.not.toBeInstanceOf(
      UnrecoverableError
    );
    expect(recordMailSyncError).toHaveBeenCalledWith(
      "acc1",
      "token_unavailable"
    );
    expect(pauseMailAccountSync).not.toHaveBeenCalled();

    jest.mocked(getMailAccountSyncError).mockResolvedValue("token_unavailable");
    await expect(processMailSyncJob(job(3))).rejects.toBeInstanceOf(
      UnrecoverableError
    );
    expect(pauseMailAccountSync).toHaveBeenCalledWith(
      "acc1",
      "token_unavailable"
    );
    expect(removeMailSyncSchedule).toHaveBeenCalledWith("acc1");
  });
});

describe("describeFailedJob", () => {
  it("keeps the cause through the logger and leaks no secrets", () => {
    const secret = ["ya29", "fake-access-token-for-tests-only-0123456789"].join(
      "."
    );
    const error = new Error(
      `Refresh failed for jane.doe@example.com access_token=abc123 ${secret}\n` +
        "x".repeat(900)
    );
    error.name = "GaxiosError";
    const fields = describeFailedJob("mail-sync", job(2), error);
    expect(fields).toMatchObject({
      queue: "mail-sync",
      jobName: "sync-account",
      attemptsMade: 2,
      errorName: "GaxiosError",
    });
    expect(fields.reason.length).toBeLessThanOrEqual(300);
    expect(fields.reason).not.toContain("jane.doe");
    expect(fields.reason).not.toContain("abc123");
    expect(fields.reason).not.toContain(secret);
    // The persisted row is what the logger keeps after its own filter.
    const persisted = sanitizeLogMetadata(fields);
    expect(persisted).toMatchObject({
      reason: fields.reason,
      errorName: "GaxiosError",
      attemptsMade: 2,
      jobName: "sync-account",
    });
  });
});
