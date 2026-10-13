import { serialByKey } from "../serial";

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("serialByKey", () => {
  it("starts a write for one key only after the previous one settles", async () => {
    const log: string[] = [];
    let release!: () => void;
    const first = serialByKey("t1", async () => {
      log.push("a:start");
      await new Promise<void>((r) => (release = r));
      log.push("a:end");
      return "a";
    });
    const second = serialByKey("t1", async () => {
      log.push("b:start");
      return "b";
    });
    await tick();
    expect(log).toEqual(["a:start"]);
    release();
    await expect(first).resolves.toBe("a");
    await expect(second).resolves.toBe("b");
    expect(log).toEqual(["a:start", "a:end", "b:start"]);
  });

  it("runs the next write after a failed one and keeps its own result", async () => {
    const failed = serialByKey("t2", async () => {
      throw new Error("409");
    });
    const next = serialByKey("t2", async () => "ok");
    await expect(failed).rejects.toThrow("409");
    await expect(next).resolves.toBe("ok");
  });

  it("does not hold writes for different keys behind each other", async () => {
    const log: string[] = [];
    let release!: () => void;
    void serialByKey("x", () => new Promise<void>((r) => (release = r)));
    await serialByKey("y", async () => log.push("y"));
    expect(log).toEqual(["y"]);
    release();
  });
});
