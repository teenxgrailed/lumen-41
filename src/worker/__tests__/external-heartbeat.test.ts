import {
  EXTERNAL_HEARTBEAT_TIMEOUT_MS,
  pingExternalHeartbeat,
  startExternalHeartbeat,
} from "@/worker/external-heartbeat";

jest.mock("@/lib/logger", () => ({
  logger: {
    warn: jest.fn().mockResolvedValue(undefined),
  },
}));

describe("external worker heartbeat", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("does nothing when no heartbeat URL is configured", () => {
    const fetchImpl = jest.fn();

    expect(startExternalHeartbeat(1_000, undefined, fetchImpl)).toBeNull();
    expect(startExternalHeartbeat(1_000, "  ", fetchImpl)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("pings on start and on every tick when a URL is configured", () => {
    jest.useFakeTimers();
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, status: 200 });

    const interval = startExternalHeartbeat(
      1_000,
      "https://uptime.example/ping",
      fetchImpl
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(2_000);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://uptime.example/ping",
      expect.objectContaining({ method: "GET" })
    );
    clearInterval(interval!);
  });

  it("reports success", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, status: 200 });

    await expect(
      pingExternalHeartbeat("https://uptime.example/ping", fetchImpl)
    ).resolves.toBe(true);
  });

  it("does not throw when the monitor errors or is unreachable", async () => {
    const failing = jest.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const erroring = jest.fn().mockResolvedValue({ ok: false, status: 503 });

    await expect(
      pingExternalHeartbeat("https://uptime.example/ping", failing)
    ).resolves.toBe(false);
    await expect(
      pingExternalHeartbeat("https://uptime.example/ping", erroring)
    ).resolves.toBe(false);
  });

  it("aborts a request that outlives the timeout without throwing", async () => {
    jest.useFakeTimers();
    const hanging = jest.fn(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise<{ ok: boolean; status: number }>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted"))
          );
        })
    );

    const result = pingExternalHeartbeat(
      "https://uptime.example/ping",
      hanging
    );
    jest.advanceTimersByTime(EXTERNAL_HEARTBEAT_TIMEOUT_MS);

    await expect(result).resolves.toBe(false);
  });
});
