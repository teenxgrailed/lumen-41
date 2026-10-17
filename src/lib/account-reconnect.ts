/**
 * True when a calendar account has synced calendars and every one of them
 * failed on its last run: the sign-in was revoked or expired, the one thing a
 * retry cannot fix. A single failing calendar is not enough (that is a
 * calendar problem, not the account's).
 */
export function accountNeedsReconnect(
  calendars: readonly { enabled: boolean; error: string | null }[]
) {
  const synced = calendars.filter((c) => c.enabled);
  return synced.length > 0 && synced.every((c) => Boolean(c.error));
}
