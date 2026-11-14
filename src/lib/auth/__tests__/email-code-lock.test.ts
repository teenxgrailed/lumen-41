import {
  EMAIL_CODE_LOCK_AFTER_WRONG,
  EMAIL_CODE_LOCK_WINDOW_SECONDS,
  isEmailCodeLocked,
  recordWrongEmailCode,
} from "@/lib/auth/email-code-lock";

/* A one-key fake of the Redis the lock uses. */
const store = new Map<string, number>();
const ttl = new Map<string, number>();
const redis = {
  eval: jest.fn(async (_s: string, _n: number, key: string, ex: string) => {
    const n = (store.get(key) ?? 0) + 1;
    store.set(key, n);
    if (n === 1) ttl.set(key, Number(ex));
    return n;
  }),
  get: jest.fn(async (key: string) =>
    store.has(key) ? String(store.get(key)) : null
  ),
};
jest.mock("@/lib/queue/connection", () => ({
  getRedisConnection: () => redis,
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

beforeEach(() => {
  store.clear();
  ttl.clear();
  jest.clearAllMocks();
  process.env.RATE_LIMIT_HASH_SECRET = "test-hash-secret";
});

describe("the daily email-code lock", () => {
  it("opens until 20 wrong codes, then locks the address for the day", async () => {
    for (let i = 0; i < EMAIL_CODE_LOCK_AFTER_WRONG - 1; i += 1) {
      await recordWrongEmailCode("a@example.com");
    }
    expect(await isEmailCodeLocked("a@example.com")).toBe(false);
    await recordWrongEmailCode("a@example.com");
    expect(await isEmailCodeLocked("a@example.com")).toBe(true);
    expect([...ttl.values()]).toEqual([EMAIL_CODE_LOCK_WINDOW_SECONDS]);
  });

  it("counts per address and ignores case and spaces", async () => {
    for (let i = 0; i < EMAIL_CODE_LOCK_AFTER_WRONG; i += 1) {
      await recordWrongEmailCode(" A@Example.com ");
    }
    expect(await isEmailCodeLocked("a@example.com")).toBe(true);
    expect(await isEmailCodeLocked("b@example.com")).toBe(false);
  });

  it("never stores the address itself", async () => {
    await recordWrongEmailCode("a@example.com");
    expect([...store.keys()].join()).not.toContain("example.com");
  });

  it("waits (locked) when Redis cannot answer, and counting never throws", async () => {
    redis.get.mockRejectedValueOnce(new Error("down"));
    expect(await isEmailCodeLocked("a@example.com")).toBe(true);
    redis.eval.mockRejectedValueOnce(new Error("down"));
    await expect(
      recordWrongEmailCode("a@example.com")
    ).resolves.toBeUndefined();
  });
});
