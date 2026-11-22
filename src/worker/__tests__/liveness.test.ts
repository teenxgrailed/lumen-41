import {
  getLastWorkerTickAt,
  markWorkerTick,
  resetWorkerTickForTests,
  startWorkerTick,
} from "@/worker/liveness";

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe("worker liveness tick", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetWorkerTickForTests();
  });
  afterEach(() => jest.useRealTimers());

  it("ticks on an idle worker and only after PING succeeds", async () => {
    let result: "ok" | "fail" = "ok";
    const interval = startWorkerTick(async () => result, 1_000);
    await jest.advanceTimersByTimeAsync(0);
    const first = getLastWorkerTickAt();
    expect(first).not.toBeNull();

    result = "fail";
    await jest.advanceTimersByTimeAsync(5_000);
    expect(getLastWorkerTickAt()).toBe(first);

    result = "ok";
    await jest.advanceTimersByTimeAsync(1_000);
    expect(getLastWorkerTickAt()).toBeGreaterThan(first as number);
    clearInterval(interval);
  });

  it("does not stack probes while one is still running", async () => {
    const ping = jest.fn(() => new Promise<"ok">(() => undefined));
    const interval = startWorkerTick(ping, 1_000);
    await jest.advanceTimersByTimeAsync(5_000);
    expect(ping).toHaveBeenCalledTimes(1);
    clearInterval(interval);
  });

  it("markWorkerTick records the given time", () => {
    markWorkerTick(42);
    expect(getLastWorkerTickAt()).toBe(42);
  });
});
