import { prisma } from "@/lib/prisma";

import { HEARTBEAT_INTERVAL_MS, createImportHeartbeat } from "../heartbeat";

jest.mock("@/lib/prisma", () => ({
  prisma: { importRun: { updateMany: jest.fn() } },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const updateMany = jest.mocked(prisma.importRun.updateMany);

function clock(start = Date.UTC(2026, 9, 12, 10, 0, 0)) {
  let now = start;
  return {
    now: () => new Date(now),
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("import heartbeat", () => {
  beforeEach(() => {
    updateMany.mockReset();
    updateMany.mockResolvedValue({ count: 1 });
  });

  it("writes on the first call and not again within 60 seconds", async () => {
    const time = clock();
    const beat = createImportHeartbeat("run-1", { now: time.now });
    await beat();
    time.advance(10_000);
    await beat();
    time.advance(49_000);
    await beat();
    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  it("writes again once 60 seconds have passed, then throttles again", async () => {
    const time = clock();
    const beat = createImportHeartbeat("run-1", { now: time.now });
    await beat();
    time.advance(HEARTBEAT_INTERVAL_MS);
    await beat();
    expect(updateMany).toHaveBeenCalledTimes(2);
    time.advance(1_000);
    await beat();
    expect(updateMany).toHaveBeenCalledTimes(2);
    time.advance(HEARTBEAT_INTERVAL_MS);
    await beat();
    expect(updateMany).toHaveBeenCalledTimes(3);
  });

  it("bumps updatedAt only on the run while it is running", async () => {
    const time = clock();
    const beat = createImportHeartbeat("run-7", { now: time.now });
    await beat();
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "run-7", status: "running" },
      data: { updatedAt: time.now() },
    });
  });

  it("never throws when the write fails, and still throttles", async () => {
    const time = clock();
    updateMany.mockRejectedValue(new Error("db down"));
    const beat = createImportHeartbeat("run-1", { now: time.now });
    await expect(beat()).resolves.toBeUndefined();
    await beat();
    expect(updateMany).toHaveBeenCalledTimes(1);
  });

  it("keeps separate throttles per run", async () => {
    const time = clock();
    const a = createImportHeartbeat("run-a", { now: time.now });
    const b = createImportHeartbeat("run-b", { now: time.now });
    await a();
    await b();
    expect(updateMany).toHaveBeenCalledTimes(2);
  });
});
