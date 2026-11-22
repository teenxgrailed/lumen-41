import IORedis from "ioredis";

import { logger } from "@/lib/logger";

const LOG_SOURCE = "RedisHealth";
export const REDIS_PING_TIMEOUT_MS = 1_000;

export type RedisHealth = "ok" | "fail";

export interface RedisPingClient {
  ping(): Promise<unknown>;
}

let pingClient: IORedis | null = null;

/**
 * A small dedicated client: no offline queue and no retries, so a dead Redis
 * answers "fail" within the timeout instead of queueing the command. The
 * client is dropped on "end" and rebuilt on the next probe.
 */
function getPingClient(): IORedis {
  if (!pingClient) {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) throw new Error("REDIS_URL is not set");
    const client = new IORedis(redisUrl, {
      commandTimeout: REDIS_PING_TIMEOUT_MS,
      connectTimeout: REDIS_PING_TIMEOUT_MS,
      enableOfflineQueue: false,
      enableReadyCheck: false,
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
    });
    client.on("error", (error) => {
      void logger
        .warn("Redis health probe error", { error: error.message }, LOG_SOURCE)
        .catch(() => undefined);
    });
    client.on("end", () => {
      if (pingClient === client) pingClient = null;
    });
    pingClient = client;
  }
  return pingClient;
}

/** PING Redis, giving up after timeoutMs. Never throws, never leaks details. */
export async function checkRedis(
  timeoutMs = REDIS_PING_TIMEOUT_MS,
  client?: RedisPingClient
): Promise<RedisHealth> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const target = client ?? getPingClient();
    const probe = (async () => {
      if (!client && pingClient && pingClient.status === "wait") {
        await pingClient.connect();
      }
      return (await target.ping()) === "PONG";
    })();
    // The probe may reject after the race is lost; keep that from surfacing.
    probe.catch(() => undefined);
    const ok = await Promise.race([
      probe,
      new Promise<boolean>((resolve) => {
        timeout = setTimeout(resolve, timeoutMs, false);
        timeout.unref?.();
      }),
    ]);
    return ok ? "ok" : "fail";
  } catch {
    return "fail";
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
