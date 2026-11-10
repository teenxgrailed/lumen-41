import { getRedisConnection } from "@/lib/queue/connection";
import {
  enforceCredentialLock,
  enforceRateLimits,
} from "@/lib/security/rate-limit";

jest.mock("@sentry/nextjs", () => ({ captureMessage: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock("@/lib/queue/connection", () => ({
  getRedisConnection: jest.fn(),
}));

const never = () => new Promise<never>(() => {});

describe("rate limiter during a Redis outage", () => {
  beforeEach(() => {
    process.env.RATE_LIMIT_HASH_SECRET = "test-secret";
    jest.useFakeTimers();
    jest.mocked(getRedisConnection).mockReturnValue({
      eval: jest.fn(never),
      ttl: jest.fn(never),
    } as never);
  });
  afterEach(() => jest.useRealTimers());

  it("answers 503 instead of hanging on a command that never settles", async () => {
    const pending = enforceRateLimits(
      [{ namespace: "n", identifier: "i", limit: 1, windowSeconds: 60 }],
      { route: "/x" }
    );
    await jest.advanceTimersByTimeAsync(2_000);
    await expect(pending).resolves.toMatchObject({ status: 503 });
  });

  it("answers 503 from the credential lock too", async () => {
    const pending = enforceCredentialLock("a@example.com");
    await jest.advanceTimersByTimeAsync(2_000);
    await expect(pending).resolves.toMatchObject({ status: 503 });
  });
});
