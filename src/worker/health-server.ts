import {
  WORKER_STARTUP_GRACE_MS,
  WORKER_TICK_MAX_AGE_MS,
  getLastWorkerTickAt,
} from "@/worker/liveness";
import { type Server, createServer } from "node:http";

import { type RedisHealth, checkRedis } from "@/lib/health/redis";

export type WorkerHealthServerOptions = {
  buildSha?: string;
  host?: string;
  port?: number;
  /**
   * Opt in to real checks. Without it the server only answers that the
   * process is up (kept for tests and tools that start it bare).
   */
  liveness?: {
    pingRedis?: () => Promise<RedisHealth>;
    getLastTickAt?: () => number | null;
    maxTickAgeMs?: number;
    startupGraceMs?: number;
    now?: () => number;
  };
};

export async function startWorkerHealthServer(
  options: WorkerHealthServerOptions = {}
): Promise<Server> {
  const buildSha = options.buildSha ?? process.env.NEEDT_BUILD_SHA ?? "local";
  const host = options.host ?? process.env.WORKER_HEALTH_HOST ?? "127.0.0.1";
  const port = options.port ?? Number(process.env.WORKER_HEALTH_PORT ?? 1235);
  const liveness = options.liveness;
  const now = liveness?.now ?? Date.now;
  const startedAt = now();
  const server = createServer((request, response) => {
    if (
      request.method !== "GET" ||
      request.url?.split("?", 1)[0] !== "/health"
    ) {
      response.writeHead(404).end();
      return;
    }

    if (!liveness) {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true, service: "worker", buildSha }));
      return;
    }

    void (async () => {
      const maxAge = liveness.maxTickAgeMs ?? WORKER_TICK_MAX_AGE_MS;
      const grace = liveness.startupGraceMs ?? WORKER_STARTUP_GRACE_MS;
      const redis = await (liveness.pingRedis ?? (() => checkRedis()))();
      const lastTick = (liveness.getLastTickAt ?? getLastWorkerTickAt)();
      const tickAgeMs = lastTick === null ? null : now() - lastTick;
      // Before the first tick the worker is still booting; give it the grace
      // window instead of getting it restarted mid-start.
      const tickOk =
        tickAgeMs === null ? now() - startedAt < grace : tickAgeMs <= maxAge;
      // The live PING is reported only. Failing on one blip would restart-loop
      // the worker; the tick going stale (Redis down for 60 s) is the signal.
      const ok = tickOk;
      response.writeHead(ok ? 200 : 503, {
        "Content-Type": "application/json",
      });
      response.end(
        JSON.stringify({ ok, service: "worker", buildSha, redis, tickAgeMs })
      );
    })().catch(() => {
      response.writeHead(503, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: false, service: "worker", buildSha }));
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  return server;
}

export async function stopWorkerHealthServer(server: Server | null) {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
