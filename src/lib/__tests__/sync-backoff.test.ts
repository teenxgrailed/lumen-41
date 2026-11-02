import {
  SYNC_BACKOFF_BASE_MS,
  SYNC_BACKOFF_MAX_MS,
  SYNC_REAUTH_BACKOFF_MS,
  nextSyncAttemptAfterFailure,
  syncBackoffDelayMs,
} from "@/lib/sync-backoff";

describe("sync backoff", () => {
  it("doubles from 15 minutes and caps at 12 hours", () => {
    expect(syncBackoffDelayMs(1)).toBe(SYNC_BACKOFF_BASE_MS);
    expect(syncBackoffDelayMs(2)).toBe(SYNC_BACKOFF_BASE_MS * 2);
    expect(syncBackoffDelayMs(4)).toBe(SYNC_BACKOFF_BASE_MS * 8);
    expect(syncBackoffDelayMs(10)).toBe(SYNC_BACKOFF_MAX_MS);
    expect(syncBackoffDelayMs(10_000)).toBe(SYNC_BACKOFF_MAX_MS);
  });

  it("treats a zero or negative count as the first failure", () => {
    expect(syncBackoffDelayMs(0)).toBe(SYNC_BACKOFF_BASE_MS);
  });

  it("waits a day when the sign-in needs reauth, whatever the count", () => {
    const now = new Date("2026-11-02T10:00:00.000Z");
    expect(nextSyncAttemptAfterFailure(now, 1, true).getTime()).toBe(
      now.getTime() + SYNC_REAUTH_BACKOFF_MS
    );
    expect(nextSyncAttemptAfterFailure(now, 2, false).getTime()).toBe(
      now.getTime() + SYNC_BACKOFF_BASE_MS * 2
    );
  });
});
