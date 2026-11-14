import { logger } from "@/lib/logger";
import { getRedisConnection } from "@/lib/queue/connection";
import {
  hashRateLimitIdentifier,
  withRedisTimeout,
} from "@/lib/security/rate-limit";

const LOG_SOURCE = "EmailCodeLock";

/**
 * A code is only six digits, so an address that keeps getting codes wrong is
 * being guessed at. After this many wrong tries in a day, code sign-in is off
 * for that address until the day is up. The answer stays generic (the same as
 * any wrong code, and a send that mails nothing), so it is not an oracle, and
 * the password sign-in is untouched.
 */
export const EMAIL_CODE_LOCK_AFTER_WRONG = 20;
export const EMAIL_CODE_LOCK_WINDOW_SECONDS = 24 * 60 * 60;

const COUNT_SCRIPT = `
local n = redis.call("INCR", KEYS[1])
if n == 1 then redis.call("EXPIRE", KEYS[1], ARGV[1]) end
return n
`;

function key(email: string): string {
  return `needt:email-code:wrong:${hashRateLimitIdentifier(email)}`;
}

/** Counts one wrong code. Never throws: a Redis outage must not open a hole
    (the per-code cap of five still holds) or break the sign-in page. */
export async function recordWrongEmailCode(email: string): Promise<void> {
  try {
    await withRedisTimeout(
      getRedisConnection().eval(
        COUNT_SCRIPT,
        1,
        key(email),
        String(EMAIL_CODE_LOCK_WINDOW_SECONDS)
      ) as Promise<number>
    );
  } catch (error) {
    logger.error(
      "Could not count a wrong email code",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
  }
}

/** True while the address has used up its wrong tries for the day. Fails
    closed: when Redis cannot answer, code sign-in waits. */
export async function isEmailCodeLocked(email: string): Promise<boolean> {
  try {
    const raw = await withRedisTimeout(
      getRedisConnection().get(key(email)) as Promise<string | null>
    );
    return Number(raw ?? 0) >= EMAIL_CODE_LOCK_AFTER_WRONG;
  } catch (error) {
    logger.error(
      "Could not read the email code lock",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
    return true;
  }
}
