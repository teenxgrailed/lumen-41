import {
  type RateLimitRule,
  enforceRateLimits,
  hashRateLimitIdentifier,
} from "@/lib/security/rate-limit";

/** The client IP as the proxy reported it (same reading as requestIp). */
export function ipFromHeaders(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

function ipRuleFor(
  ip: string,
  namespace: string,
  limit: number,
  windowSeconds: number
): RateLimitRule {
  return {
    namespace,
    identifier: hashRateLimitIdentifier(ip),
    limit,
    windowSeconds,
  };
}

/** Authorization page and consent POST: before any client lookup. */
export const AUTHORIZE_LIMIT_PER_MINUTE = 60;
export const DECISION_LIMIT_PER_MINUTE = 30;
/** Network fetches of client metadata documents (cache misses). */
export const CIMD_FETCH_IP_PER_MINUTE = 10;
export const CIMD_FETCH_GLOBAL_PER_MINUTE = 300;

/** null when allowed, else the 429/503 response to send. */
export function limitAuthorize(ip: string, route: string, perMinute: number) {
  return enforceRateLimits(
    [ipRuleFor(ip, `oauth${route.replace(/\//g, "-")}:ip`, perMinute, 60)],
    { route }
  );
}

/**
 * The guard passed to resolveClient: a CIMD cache miss costs an outbound
 * fetch, so it is limited per IP and across everyone.
 */
export function cimdFetchGuard(ip: string, route: string) {
  return async () =>
    (await enforceRateLimits(
      [
        ipRuleFor(ip, "oauth-cimd-fetch:ip", CIMD_FETCH_IP_PER_MINUTE, 60),
        {
          namespace: "oauth-cimd-fetch:global",
          identifier: "all",
          limit: CIMD_FETCH_GLOBAL_PER_MINUTE,
          windowSeconds: 60,
        },
      ],
      { route }
    )) === null;
}
