import { noteServerBuild } from "@/lib/pwa/build-version";

/**
 * `fetch` for the app's own API that survives a deploy. While a container is
 * swapped the edge answers 502/503/504, a connection closes, or a request is
 * briefly refused with 401 before the new container knows the session. None of
 * that is the person's doing, so:
 *
 * - an idempotent read (GET/HEAD) is retried on 502/503/504 and on a network
 *   error, twice, with a short growing wait;
 * - a 401 on a same-origin call is held back until the session has been asked
 *   once (`/api/auth/session`); if it still names a user the call is repeated,
 *   if not the 401 stands (the person really is signed out);
 * - every response is checked for a build SHA different from the page's.
 */
export const RETRY_STATUSES: ReadonlySet<number> = new Set([502, 503, 504]);
export const RETRY_DELAYS_MS: readonly number[] = [300, 900];

const SESSION_URL = "/api/auth/session";
const SESSION_TTL_MS = 5_000;

export interface ResilientOptions {
  delaysMs?: readonly number[];
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const isRead = (init?: RequestInit) => {
  const m = (init?.method ?? "GET").toUpperCase();
  return m === "GET" || m === "HEAD";
};

/** A body that can be sent a second time. */
const canRepeat = (init?: RequestInit) => {
  const b = init?.body;
  return (
    b == null ||
    typeof b === "string" ||
    b instanceof URLSearchParams ||
    (typeof FormData !== "undefined" && b instanceof FormData)
  );
};

const sameOriginApi = (url: string) =>
  url.startsWith("/api/") && !url.startsWith("/api/auth/");

let sessionCheck: { at: number; run: Promise<boolean> } | null = null;

/** Whether the server still sees a signed-in person. One probe at a time. */
async function sessionStillValid(
  fetcher: typeof fetch,
  now: number
): Promise<boolean> {
  if (sessionCheck && now - sessionCheck.at < SESSION_TTL_MS) {
    return sessionCheck.run;
  }
  const run = (async () => {
    try {
      const res = await fetcher(SESSION_URL, { cache: "no-store" });
      if (!res.ok) return false;
      const body = (await res.json()) as { user?: unknown } | null;
      return !!body && typeof body === "object" && !!body.user;
    } catch {
      // Cannot tell: assume the session is fine and let the call repeat once.
      return true;
    }
  })();
  sessionCheck = { at: now, run };
  return run;
}

/** Test seam. */
export function resetResilientFetch() {
  sessionCheck = null;
}

export async function resilientFetch(
  url: string,
  init?: RequestInit,
  options: ResilientOptions = {}
): Promise<Response> {
  const delays = options.delaysMs ?? RETRY_DELAYS_MS;
  const sleep = options.sleep ?? defaultSleep;
  const read = isRead(init);

  let attempt = 0;
  let res: Response | undefined;
  for (;;) {
    try {
      res = await fetch(url, init);
    } catch (error) {
      if (!read || attempt >= delays.length) throw error;
      await sleep(delays[attempt++]);
      continue;
    }
    if (read && RETRY_STATUSES.has(res.status) && attempt < delays.length) {
      await sleep(delays[attempt++]);
      continue;
    }
    break;
  }

  noteServerBuild(res);

  if (res.status === 401 && sameOriginApi(url) && canRepeat(init)) {
    const valid = await sessionStillValid(fetch, Date.now());
    if (valid) {
      try {
        const again = await fetch(url, init);
        noteServerBuild(again);
        return again;
      } catch {
        return res;
      }
    }
  }
  return res;
}
