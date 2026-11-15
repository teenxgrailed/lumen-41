import { checkRedis } from "@/lib/health/redis";

export const WORKER_TICK_INTERVAL_MS = 15_000;
/** Four missed ticks. A single slow Redis round trip never trips it. */
export const WORKER_TICK_MAX_AGE_MS = 60_000;
/** Time allowed after boot for the first tick (cold Redis, slow host). */
export const WORKER_STARTUP_GRACE_MS = 120_000;

let lastTickAt: number | null = null;

export function markWorkerTick(now = Date.now()): void {
  lastTickAt = now;
}

export function getLastWorkerTickAt(): number | null {
  return lastTickAt;
}

export function resetWorkerTickForTests(): void {
  lastTickAt = null;
}

/**
 * The liveness tick: a timer the worker always runs, whether or not a job
 * ever arrives, that records itself only after a Redis PING succeeds. An idle
 * queue keeps ticking; a blocked event loop or a lost Redis stops it.
 */
export function startWorkerTick(
  ping: () => Promise<"ok" | "fail"> = () => checkRedis(),
  intervalMs = WORKER_TICK_INTERVAL_MS
): ReturnType<typeof setInterval> {
  let inFlight = false;
  const tick = () => {
    if (inFlight) return;
    inFlight = true;
    void ping()
      .then((result) => {
        if (result === "ok") markWorkerTick();
      })
      .catch(() => undefined)
      .finally(() => {
        inFlight = false;
      });
  };
  tick();
  const interval = setInterval(tick, intervalMs);
  interval.unref?.();
  return interval;
}
