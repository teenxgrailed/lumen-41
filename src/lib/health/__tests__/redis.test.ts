import { checkRedis } from "@/lib/health/redis";

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe("checkRedis", () => {
  it("is ok on PONG", async () => {
    await expect(checkRedis(1_000, { ping: async () => "PONG" })).resolves.toBe(
      "ok"
    );
  });

  it("fails when PING rejects", async () => {
    await expect(
      checkRedis(1_000, {
        ping: async () => {
          throw new Error("ECONNREFUSED");
        },
      })
    ).resolves.toBe("fail");
  });

  it("fails on an unexpected reply", async () => {
    await expect(
      checkRedis(1_000, { ping: async () => "LOADING" })
    ).resolves.toBe("fail");
  });

  it("gives up when PING hangs", async () => {
    const startedAt = Date.now();
    await expect(
      checkRedis(50, { ping: () => new Promise(() => undefined) })
    ).resolves.toBe("fail");
    expect(Date.now() - startedAt).toBeLessThan(900);
  });

  it("fails without REDIS_URL instead of throwing", async () => {
    const original = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
    try {
      await expect(checkRedis(50)).resolves.toBe("fail");
    } finally {
      if (original !== undefined) process.env.REDIS_URL = original;
    }
  });
});
