import {
  DEFAULT_DRAIN_MS,
  MAX_DRAIN_MS,
  getDrainMs,
  handleShutdownSignal,
  installDrainHandlers,
  isDraining,
  resetDrainStateForTests,
} from "@/lib/drain";

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe("drain", () => {
  let exitSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    resetDrainStateForTests();
    delete process.env.NEEDT_DRAIN_MS;
    exitSpy = jest
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);
  });

  afterEach(() => {
    resetDrainStateForTests();
    exitSpy.mockRestore();
    jest.useRealTimers();
  });

  it("marks draining on the first signal and exits after the default delay", () => {
    expect(isDraining()).toBe(false);

    handleShutdownSignal("SIGTERM");

    expect(isDraining()).toBe(true);
    expect(exitSpy).not.toHaveBeenCalled();

    jest.advanceTimersByTime(DEFAULT_DRAIN_MS - 1);
    expect(exitSpy).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(exitSpy).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("honours NEEDT_DRAIN_MS", () => {
    process.env.NEEDT_DRAIN_MS = "2000";

    handleShutdownSignal("SIGTERM");
    jest.advanceTimersByTime(1_999);
    expect(exitSpy).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("exits immediately on a second signal and cancels the timer", () => {
    handleShutdownSignal("SIGTERM");
    handleShutdownSignal("SIGINT");

    expect(exitSpy).toHaveBeenCalledTimes(1);
    expect(exitSpy).toHaveBeenCalledWith(0);

    jest.advanceTimersByTime(DEFAULT_DRAIN_MS * 2);
    expect(exitSpy).toHaveBeenCalledTimes(1);
  });

  it("falls back to the default for bad values and caps below Docker's 10 s", () => {
    expect(getDrainMs({})).toBe(DEFAULT_DRAIN_MS);
    expect(getDrainMs({ NEEDT_DRAIN_MS: "abc" })).toBe(DEFAULT_DRAIN_MS);
    expect(getDrainMs({ NEEDT_DRAIN_MS: "-5" })).toBe(DEFAULT_DRAIN_MS);
    expect(getDrainMs({ NEEDT_DRAIN_MS: "60000" })).toBe(MAX_DRAIN_MS);
    expect(MAX_DRAIN_MS).toBeLessThan(10_000);
  });

  it("registers SIGTERM and SIGINT handlers only once", () => {
    const onSpy = jest
      .spyOn(process, "on")
      .mockImplementation((() => process) as never);

    installDrainHandlers();
    installDrainHandlers();

    const events = onSpy.mock.calls.map((call) => call[0]);
    expect(events.filter((e) => e === "SIGTERM")).toHaveLength(1);
    expect(events.filter((e) => e === "SIGINT")).toHaveLength(1);
    onSpy.mockRestore();
  });
});
