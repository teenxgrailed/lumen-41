import { NextRequest, NextResponse } from "next/server";

import * as Sentry from "@sentry/nextjs";
import { createHmac } from "crypto";

import { logger } from "@/lib/logger";
import { getRedisConnection } from "@/lib/queue/connection";

const LOG_SOURCE = "RateLimit";

const LIMIT_SCRIPT = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
return {current, ttl}
`;
const FAILURE_SCRIPT = `
local failures = redis.call("INCR", KEYS[1])
if failures == 1 then redis.call("EXPIRE", KEYS[1], 900) end
if failures < 5 then return {failures, 0} end
local strikes = redis.call("INCR", KEYS[2])
redis.call("EXPIRE", KEYS[2], 86400)
local lockSeconds = 900
if strikes > 1 then lockSeconds = 3600 end
redis.call("SET", KEYS[3], lockSeconds, "EX", lockSeconds)
redis.call("DEL", KEYS[1])
return {failures, lockSeconds}
`;
const BYTE_BUDGET_SCRIPT = `
local current = redis.call("INCRBY", KEYS[1], ARGV[1])
if current == tonumber(ARGV[1]) then
  redis.call("EXPIRE", KEYS[1], ARGV[2])
end
local ttl = redis.call("TTL", KEYS[1])
return {current, ttl}
`;

export interface RateLimitRule {
  namespace: string;
  identifier: string;
  limit: number;
  windowSeconds: number;
}

export function requestIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return (
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

export function hashRateLimitIdentifier(value: string): string {
  const secret = process.env.RATE_LIMIT_HASH_SECRET;
  if (!secret) {
    throw new Error("RATE_LIMIT_HASH_SECRET is required.");
  }
  return createHmac("sha256", secret)
    .update(value.trim().toLowerCase())
    .digest("hex");
}

export function ipRule(
  request: NextRequest,
  namespace: string,
  limit: number,
  windowSeconds: number
): RateLimitRule {
  return {
    namespace,
    identifier: hashRateLimitIdentifier(requestIp(request)),
    limit,
    windowSeconds,
  };
}

export function accountRule(
  value: string,
  namespace: string,
  limit: number,
  windowSeconds: number
): RateLimitRule {
  return {
    namespace,
    identifier: hashRateLimitIdentifier(value),
    limit,
    windowSeconds,
  };
}

export async function enforceRateLimits(
  rules: RateLimitRule[],
  metadata: { route: string; userId?: string }
): Promise<NextResponse | null> {
  try {
    const redis = getRedisConnection();
    for (const rule of rules) {
      const key = `needt:rate-limit:${rule.namespace}:${rule.identifier}`;
      const [count, ttlMs] = (await redis.eval(
        LIMIT_SCRIPT,
        1,
        key,
        String(rule.windowSeconds * 1_000)
      )) as [number, number];

      if (count > rule.limit) {
        const retryAfter = Math.max(1, Math.ceil(ttlMs / 1_000));
        await logger.warn(
          "Request rejected by rate limit",
          {
            route: metadata.route,
            userId: metadata.userId ?? null,
            identifierHash: rule.identifier,
            namespace: rule.namespace,
            count,
          },
          LOG_SOURCE
        );
        const spikeKey = `needt:rate-limit-spike:${metadata.route}:${Math.floor(Date.now() / 300_000)}`;
        const blockedInWindow = await redis.incr(spikeKey);
        if (blockedInWindow === 1) await redis.expire(spikeKey, 300);
        if (blockedInWindow === 50) {
          Sentry.captureMessage(
            `Abnormal rate-limit spike on ${metadata.route}`,
            "warning"
          );
        }
        return NextResponse.json(
          { error: "Too many attempts. Try again later." },
          {
            status: 429,
            headers: { "Retry-After": String(retryAfter) },
          }
        );
      }
    }
    return null;
  } catch (error) {
    await logger.error(
      "Rate limiter unavailable",
      {
        route: metadata.route,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "This action is temporarily unavailable." },
      { status: 503, headers: { "Retry-After": "30" } }
    );
  }
}

export async function enforceCredentialLock(
  accountIdentifier: string
): Promise<NextResponse | null> {
  try {
    const hash = hashRateLimitIdentifier(accountIdentifier || "missing");
    const redis = getRedisConnection();
    const ttl = await redis.ttl(`needt:credentials:lock:${hash}`);
    if (ttl <= 0) return null;
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(ttl) } }
    );
  } catch {
    return NextResponse.json(
      { error: "This action is temporarily unavailable." },
      { status: 503, headers: { "Retry-After": "30" } }
    );
  }
}

export async function recordCredentialFailure(accountIdentifier: string) {
  const hash = hashRateLimitIdentifier(accountIdentifier || "missing");
  const redis = getRedisConnection();
  return redis.eval(
    FAILURE_SCRIPT,
    3,
    `needt:credentials:failures:${hash}`,
    `needt:credentials:strikes:${hash}`,
    `needt:credentials:lock:${hash}`
  );
}

export async function clearCredentialFailures(accountIdentifier: string) {
  const hash = hashRateLimitIdentifier(accountIdentifier || "missing");
  const redis = getRedisConnection();
  await redis.del(`needt:credentials:failures:${hash}`);
}

export async function enforceByteBudget(input: {
  namespace: string;
  identifier: string;
  bytes: number;
  limitBytes: number;
  windowSeconds: number;
  route: string;
  userId?: string;
}) {
  try {
    const identifierHash = hashRateLimitIdentifier(input.identifier);
    const redis = getRedisConnection();
    const [current, ttl] = (await redis.eval(
      BYTE_BUDGET_SCRIPT,
      1,
      `needt:byte-budget:${input.namespace}:${identifierHash}`,
      String(Math.max(0, input.bytes)),
      String(input.windowSeconds)
    )) as [number, number];
    if (current <= input.limitBytes) return null;
    await logger.warn(
      "Request rejected by attachment byte budget",
      {
        route: input.route,
        userId: input.userId ?? null,
        identifierHash,
        namespace: input.namespace,
        bytes: current,
      },
      LOG_SOURCE
    );
    return NextResponse.json(
      { error: "Attachment limit reached. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.max(1, ttl)) },
      }
    );
  } catch {
    return NextResponse.json(
      { error: "This action is temporarily unavailable." },
      { status: 503, headers: { "Retry-After": "30" } }
    );
  }
}
