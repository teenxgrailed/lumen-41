/**
 * Backoff for the sync sweeps. A feed or task list that keeps failing used to
 * be picked first on every run (it never got a newer sync time) and starved
 * the healthy ones behind it. After a failure it waits: 15 minutes, then
 * doubling, capped at 12 hours. A sign-in that was revoked (invalid_grant)
 * cannot be fixed by retrying, so it waits a day and the person is asked to
 * reconnect (the account shows "needs reconnect" from the stored error).
 */
export const SYNC_BACKOFF_BASE_MS = 15 * 60_000;
export const SYNC_BACKOFF_MAX_MS = 12 * 60 * 60_000;
export const SYNC_REAUTH_BACKOFF_MS = 24 * 60 * 60_000;

/** Wait after the `failureCount`-th consecutive failure (1 = first). */
export function syncBackoffDelayMs(failureCount: number): number {
  const exponent = Math.max(0, Math.min(failureCount, 32) - 1);
  return Math.min(SYNC_BACKOFF_BASE_MS * 2 ** exponent, SYNC_BACKOFF_MAX_MS);
}

/** The earliest time the sweeps may retry after this failure. */
export function nextSyncAttemptAfterFailure(
  now: Date,
  failureCount: number,
  needsReauth: boolean
): Date {
  const delay = needsReauth
    ? SYNC_REAUTH_BACKOFF_MS
    : syncBackoffDelayMs(failureCount);
  return new Date(now.getTime() + delay);
}
