import {
  startWorkerHealthServer,
  stopWorkerHealthServer,
} from "@/worker/health-server";
import type { AddressInfo } from "node:net";

describe("worker release health", () => {
  const originalHost = process.env.WORKER_HEALTH_HOST;

  afterAll(() => {
    if (originalHost === undefined) delete process.env.WORKER_HEALTH_HOST;
    else process.env.WORKER_HEALTH_HOST = originalHost;
  });

  it("binds only to loopback by default", async () => {
    delete process.env.WORKER_HEALTH_HOST;
    const server = await startWorkerHealthServer({
      buildSha: "worker-test-sha",
      port: 0,
    });

    try {
      expect((server.address() as AddressInfo).address).toBe("127.0.0.1");
    } finally {
      await stopWorkerHealthServer(server);
    }
  });

  it("reports the running worker build SHA", async () => {
    const server = await startWorkerHealthServer({
      buildSha: "worker-test-sha",
      host: "127.0.0.1",
      port: 0,
    });

    try {
      const { port } = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${port}/health`);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        ok: true,
        service: "worker",
        buildSha: "worker-test-sha",
      });
    } finally {
      await stopWorkerHealthServer(server);
    }
  });
});

describe("worker liveness health", () => {
  async function get(options: {
    redis: "ok" | "fail";
    lastTick: number | null;
    clock: { now: number };
  }) {
    const server = await startWorkerHealthServer({
      buildSha: "worker-test-sha",
      host: "127.0.0.1",
      port: 0,
      liveness: {
        pingRedis: async () => options.redis,
        getLastTickAt: () => options.lastTick,
        now: () => options.clock.now,
        maxTickAgeMs: 60_000,
        startupGraceMs: 120_000,
      },
    });
    try {
      const { port } = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      return { status: response.status, body: await response.json() };
    } finally {
      await stopWorkerHealthServer(server);
    }
  }

  it("is healthy with Redis up and a fresh tick, however idle the queue", async () => {
    const clock = { now: 1_000_000 };
    const { status, body } = await get({
      redis: "ok",
      lastTick: clock.now - 10_000,
      clock,
    });
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, redis: "ok", tickAgeMs: 10_000 });
  });

  it("reports a failed live PING without failing while the tick is fresh", async () => {
    const clock = { now: 1_000_000 };
    const { status, body } = await get({
      redis: "fail",
      lastTick: clock.now - 1_000,
      clock,
    });
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, redis: "fail" });
  });

  it("returns 503 when Redis stays down so the tick goes stale", async () => {
    const clock = { now: 1_000_000 };
    const { status, body } = await get({
      redis: "fail",
      lastTick: clock.now - 61_000,
      clock,
    });
    expect(status).toBe(503);
    expect(body).toMatchObject({ ok: false, redis: "fail" });
  });

  it("returns 503 when the last tick is older than the threshold", async () => {
    const clock = { now: 1_000_000 };
    const { status, body } = await get({
      redis: "ok",
      lastTick: clock.now - 61_000,
      clock,
    });
    expect(status).toBe(503);
    expect(body).toMatchObject({ ok: false, tickAgeMs: 61_000 });
  });

  it("stays healthy before the first tick while inside the startup grace", async () => {
    const clock = { now: 1_000_000 };
    const { status, body } = await get({ redis: "ok", lastTick: null, clock });
    expect(status).toBe(200);
    expect(body).toMatchObject({ ok: true, tickAgeMs: null });
  });
});
