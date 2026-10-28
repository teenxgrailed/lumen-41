import { withUserScheduleLock } from "../user-schedule-lock";

const executeRaw = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) =>
      fn({ $executeRaw: (...args: unknown[]) => executeRaw(...args) })
    ),
  },
}));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("withUserScheduleLock", () => {
  beforeEach(() => executeRaw.mockClear());

  it("runs back-to-back schedules for one user one after another", async () => {
    const events: string[] = [];
    const job = (name: string, ms: number) => async () => {
      events.push(`${name}:start`);
      await sleep(ms);
      events.push(`${name}:end`);
      return name;
    };

    const results = await Promise.all([
      withUserScheduleLock("user-1", job("a", 30)),
      withUserScheduleLock("user-1", job("b", 5)),
      withUserScheduleLock("user-1", job("c", 1)),
    ]);

    expect(results).toEqual(["a", "b", "c"]);
    expect(events).toEqual([
      "a:start",
      "a:end",
      "b:start",
      "b:end",
      "c:start",
      "c:end",
    ]);
  });

  it("does not make one user wait for another", async () => {
    const events: string[] = [];
    await Promise.all([
      withUserScheduleLock("user-1", async () => {
        events.push("1:start");
        await sleep(30);
        events.push("1:end");
      }),
      withUserScheduleLock("user-2", async () => {
        events.push("2:start");
        await sleep(1);
        events.push("2:end");
      }),
    ]);
    expect(events.indexOf("2:end")).toBeLessThan(events.indexOf("1:end"));
  });

  it("takes a database advisory lock so other processes wait too", async () => {
    await withUserScheduleLock("user-1", async () => undefined);
    expect(executeRaw).toHaveBeenCalledTimes(1);
  });

  it("keeps going for the next caller after a run throws", async () => {
    const failing = withUserScheduleLock("user-1", async () => {
      throw new Error("boom");
    });
    const next = withUserScheduleLock("user-1", async () => "ok");
    await expect(failing).rejects.toThrow("boom");
    await expect(next).resolves.toBe("ok");
  });
});
