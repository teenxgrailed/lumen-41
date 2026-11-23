import {
  clearTtlCaches,
  createTtlCache,
  setTtlCachesEnabled,
} from "@/lib/ttl-cache";

describe("ttl cache", () => {
  beforeEach(() => setTtlCachesEnabled(true));
  afterEach(() => setTtlCachesEnabled(false));

  it("reads once inside the TTL and again after it expires", async () => {
    let time = 1_000;
    const cache = createTtlCache<number>({
      name: "t-expiry",
      ttlMs: 30_000,
      now: () => time,
    });
    const load = jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);

    expect(await cache.get("k", load)).toBe(1);
    time += 29_999;
    expect(await cache.get("k", load)).toBe(1);
    expect(load).toHaveBeenCalledTimes(1);

    time += 2;
    expect(await cache.get("k", load)).toBe(2);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("keys entries apart", async () => {
    const cache = createTtlCache<string>({ name: "t-keys", ttlMs: 1000 });
    const load = jest.fn(async () => "x");
    await cache.get("a", load);
    await cache.get("b", load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("shares one read between callers that ask at the same moment", async () => {
    const cache = createTtlCache<number>({ name: "t-shared", ttlMs: 1000 });
    const load = jest.fn(async () => 7);
    const values = await Promise.all([
      cache.get("k", load),
      cache.get("k", load),
      cache.get("k", load),
    ]);
    expect(values).toEqual([7, 7, 7]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not keep a read that failed", async () => {
    const cache = createTtlCache<number>({ name: "t-fail", ttlMs: 1000 });
    const load = jest
      .fn()
      .mockRejectedValueOnce(new Error("db down"))
      .mockResolvedValueOnce(3);
    await expect(cache.get("k", load)).rejects.toThrow("db down");
    expect(await cache.get("k", load)).toBe(3);
  });

  it("clears by name or all at once", async () => {
    const a = createTtlCache<number>({ name: "t-clear-a", ttlMs: 1000 });
    const b = createTtlCache<number>({ name: "t-clear-b", ttlMs: 1000 });
    const load = jest.fn(async () => 1);
    await a.get("k", load);
    await b.get("k", load);
    clearTtlCaches("t-clear-a");
    expect(a.size).toBe(0);
    expect(b.size).toBe(1);
    clearTtlCaches();
    expect(b.size).toBe(0);
  });

  it("is empty-and-bypassed when turned off", async () => {
    const cache = createTtlCache<number>({ name: "t-off", ttlMs: 1000 });
    const load = jest.fn(async () => 1);
    setTtlCachesEnabled(false);
    await cache.get("k", load);
    await cache.get("k", load);
    expect(load).toHaveBeenCalledTimes(2);
    expect(cache.size).toBe(0);
  });

  it("empties itself instead of growing past maxEntries", async () => {
    const cache = createTtlCache<number>({
      name: "t-max",
      ttlMs: 1000,
      maxEntries: 2,
    });
    const load = jest.fn(async () => 1);
    await cache.get("a", load);
    await cache.get("b", load);
    await cache.get("c", load);
    expect(cache.size).toBe(1);
  });
});
