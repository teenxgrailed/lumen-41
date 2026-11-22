import { prisma } from "@/lib/prisma";
import { publishRealtimeEvent } from "@/lib/realtime/publish";

import {
  BACKFILL_PER_USER,
  resetBackfillCursor,
  runEasyStartBackfill,
} from "../backfill";
import { simplifyTask, stampLookedAt } from "../service";

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    featureFlag: { findUnique: jest.fn() },
    task: { findMany: jest.fn(), groupBy: jest.fn() },
    agentAction: { count: jest.fn() },
  },
}));
jest.mock("@/lib/realtime/publish", () => ({
  publishRealtimeEvent: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../service", () => ({
  simplifyTask: jest.fn(),
  stampLookedAt: jest.fn().mockResolvedValue(undefined),
}));

const flag = prisma.featureFlag.findUnique as jest.Mock;
const findMany = prisma.task.findMany as jest.Mock;
const groupBy = prisma.task.groupBy as jest.Mock;
const aiCount = prisma.agentAction.count as jest.Mock;
const stamp = jest.mocked(stampLookedAt);
const simplify = jest.mocked(simplifyTask);
const publish = jest.mocked(publishRealtimeEvent);

const NOW = new Date("2026-11-22T10:00:00.000Z");
const ids = (n: number, prefix = "t") =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}` }));

beforeEach(() => {
  jest.resetAllMocks();
  resetBackfillCursor();
  publish.mockResolvedValue(undefined);
  flag.mockResolvedValue({ enabled: true });
  groupBy.mockResolvedValue([]);
  findMany.mockResolvedValue([]);
  aiCount.mockResolvedValue(0);
  stamp.mockResolvedValue(undefined);
  simplify.mockResolvedValue({
    status: "simplified",
    actionId: "a",
    source: "ai",
  });
});

describe("runEasyStartBackfill", () => {
  it("kill switch off: nothing is read", async () => {
    flag.mockResolvedValue({ enabled: false });
    expect(await runEasyStartBackfill(NOW)).toEqual({
      skipped: "flag_off",
      tasks: 0,
      people: 0,
    });
    expect(groupBy).not.toHaveBeenCalled();
    expect(simplify).not.toHaveBeenCalled();
  });

  it("looks only at open personal tasks with no entry that were never looked at, for people in auto mode", async () => {
    await runEasyStartBackfill(NOW);
    const where = groupBy.mock.calls[0][0].where;
    expect(where).toMatchObject({
      status: "todo",
      isArchived: false,
      isSample: false,
      isRecurring: false,
      habitId: null,
      externalTaskId: null,
      simplifiedAt: null,
      userId: { not: null },
    });
    expect(where.user).toEqual({
      NOT: {
        userSettings: { is: { easyStartMode: { in: ["off", "suggest"] } } },
      },
    });
  });

  it("a small batch per person: at most 25 tasks", async () => {
    groupBy.mockResolvedValue([{ userId: "u1" }]);
    findMany.mockResolvedValue(ids(BACKFILL_PER_USER));
    await runEasyStartBackfill(NOW);
    expect(BACKFILL_PER_USER).toBe(25);
    expect(findMany.mock.calls[0][0].take).toBe(25);
    expect(findMany.mock.calls[0][0].where.userId).toBe("u1");
  });

  it("every task goes through the same easy start as a new one, quietly, and one summed line is shown", async () => {
    groupBy.mockResolvedValue([{ userId: "u1" }]);
    findMany.mockResolvedValue(ids(3));
    const result = await runEasyStartBackfill(NOW);

    expect(simplify).toHaveBeenCalledTimes(3);
    expect(simplify).toHaveBeenCalledWith({
      taskId: "t0",
      reason: "backfill",
      now: NOW,
      quiet: true,
      holdHostedAi: false,
    });
    expect(result).toEqual({ skipped: null, tasks: 3, people: 1 });
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith("u1", "easy-start", {
      message: "Simplified: gave 3 tasks a first step",
    });
  });

  it("a skipped task is not counted, and nothing is announced when none changed", async () => {
    groupBy.mockResolvedValue([{ userId: "u1" }]);
    findMany.mockResolvedValue(ids(2));
    simplify.mockResolvedValue({ status: "skipped", why: "not_eligible" });
    const result = await runEasyStartBackfill(NOW);
    expect(result).toEqual({ skipped: null, tasks: 0, people: 0 });
    expect(publish).not.toHaveBeenCalled();
  });

  it("stops for a person whose mode went off mid-batch", async () => {
    groupBy.mockResolvedValue([{ userId: "u1" }]);
    findMany.mockResolvedValue(ids(5));
    simplify.mockResolvedValue({ status: "skipped", why: "off" });
    await runEasyStartBackfill(NOW);
    expect(simplify).toHaveBeenCalledTimes(1);
  });

  it("one task that throws does not stop the rest", async () => {
    groupBy.mockResolvedValue([{ userId: "u1" }]);
    findMany.mockResolvedValue(ids(3));
    simplify.mockRejectedValueOnce(new Error("boom"));
    const result = await runEasyStartBackfill(NOW);
    expect(simplify).toHaveBeenCalledTimes(3);
    expect(result.tasks).toBe(2);
  });

  it("a task that throws is stamped, so it is not tried again every run", async () => {
    groupBy.mockResolvedValue([{ userId: "u1" }]);
    findMany.mockResolvedValue(ids(2));
    simplify.mockRejectedValueOnce(new Error("boom"));
    await runEasyStartBackfill(NOW);
    expect(stamp).toHaveBeenCalledTimes(1);
    expect(stamp).toHaveBeenCalledWith({ id: "t0", simplifiedAt: null }, NOW);
  });

  it("counts today's AI backfills (UTC day, reason backfill, not the fixed entry)", async () => {
    groupBy.mockResolvedValue([{ userId: "u1" }]);
    findMany.mockResolvedValue(ids(1));
    await runEasyStartBackfill(NOW);
    const arg = aiCount.mock.calls[0][0];
    expect(arg.where).toMatchObject({
      userId: "u1",
      op: "task.simplify",
      createdAt: { gte: new Date("2026-11-22T00:00:00.000Z") },
    });
    expect(JSON.stringify(arg.where.AND)).toContain("backfill");
  });

  it("hosted AI is held once 10 were made today, and the rest waits for tomorrow", async () => {
    groupBy.mockResolvedValue([{ userId: "u1" }]);
    findMany.mockResolvedValue(ids(25));
    aiCount.mockResolvedValue(10);
    simplify.mockResolvedValue({ status: "skipped", why: "deferred" });
    const result = await runEasyStartBackfill(NOW);
    expect(simplify).toHaveBeenCalledTimes(1);
    expect(simplify.mock.calls[0][0]).toMatchObject({ holdHostedAi: true });
    expect(stamp).not.toHaveBeenCalled();
    expect(result.tasks).toBe(0);
  });

  it("the cap counts this run too: 4 done earlier + 6 now, then held", async () => {
    groupBy.mockResolvedValue([{ userId: "u1" }]);
    findMany.mockResolvedValue(ids(25));
    aiCount.mockResolvedValue(4);
    simplify.mockImplementation(async () =>
      simplify.mock.calls.length > 6
        ? { status: "skipped", why: "deferred" }
        : { status: "simplified", actionId: "a", source: "ai" }
    );
    const result = await runEasyStartBackfill(NOW);
    expect(simplify.mock.calls[6][0]).toMatchObject({ holdHostedAi: true });
    expect(simplify.mock.calls[5][0]).toMatchObject({ holdHostedAi: false });
    expect(result.tasks).toBe(6);
  });

  it("resumes after the last person of a full page on the next run", async () => {
    const full = Array.from({ length: 50 }, (_, i) => ({
      userId: `u${String(i).padStart(3, "0")}`,
    }));
    groupBy.mockResolvedValueOnce(full).mockResolvedValueOnce([]);
    await runEasyStartBackfill(NOW);
    expect(groupBy.mock.calls[1][0].where.userId).toEqual({ gt: "u049" });
  });
});
