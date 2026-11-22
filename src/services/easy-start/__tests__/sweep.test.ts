import { prisma } from "@/lib/prisma";

import { balanceOverloadedDays, simplifyTask } from "../service";
import { runEasyStartSweep } from "../sweep";

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    featureFlag: { findUnique: jest.fn() },
    task: { findMany: jest.fn(), groupBy: jest.fn() },
  },
}));
jest.mock("../service", () => ({
  settingsOff: { userSettings: { is: { alwaysEasyStart: false } } },
  taskSelect: {},
  simplifyTask: jest.fn(),
  balanceOverloadedDays: jest.fn(),
}));

const flag = prisma.featureFlag.findUnique as jest.Mock;
const findMany = prisma.task.findMany as jest.Mock;
const groupBy = prisma.task.groupBy as jest.Mock;
const simplify = jest.mocked(simplifyTask);
const balance = jest.mocked(balanceOverloadedDays);

const NOW = new Date("2026-11-22T10:00:00.000Z");
const row = (
  id: string,
  userId: string,
  fields: Record<string, unknown> = {}
) => ({
  id,
  userId,
  status: "todo",
  isArchived: false,
  trashedAt: null,
  somedayAt: null,
  isSample: false,
  isRecurring: false,
  recurrenceMasterId: null,
  habitId: null,
  externalTaskId: null,
  rescheduleCount: 1,
  startDate: null,
  scheduledStart: null,
  lastTouchedAt: null,
  simplifiedAt: null,
  parts: [],
  ...fields,
});

beforeEach(() => {
  jest.clearAllMocks();
  flag.mockResolvedValue({ enabled: true });
  findMany.mockResolvedValue([]);
  groupBy.mockResolvedValue([]);
  simplify.mockResolvedValue({
    status: "simplified",
    actionId: "a1",
    source: "ai",
  });
  balance.mockResolvedValue({ moved: 0, actionIds: [] });
});

describe("runEasyStartSweep", () => {
  it("kill switch off: reads one flag row and touches nothing", async () => {
    flag.mockResolvedValue({ enabled: false });
    expect(await runEasyStartSweep(NOW)).toEqual({
      skipped: "flag_off",
      rewritten: 0,
      eased: 0,
    });
    expect(findMany).not.toHaveBeenCalled();
    expect(groupBy).not.toHaveBeenCalled();
    expect(simplify).not.toHaveBeenCalled();
  });

  it("asks only for tasks of people whose setting is not off", async () => {
    await runEasyStartSweep(NOW);
    expect(findMany.mock.calls[0][0].where.user).toEqual({
      NOT: { userSettings: { is: { alwaysEasyStart: false } } },
    });
    expect(groupBy.mock.calls[0][0].where.user).toEqual({
      NOT: { userSettings: { is: { alwaysEasyStart: false } } },
    });
  });

  it("re-splits a task moved once, and re-checks every candidate", async () => {
    findMany.mockResolvedValue([
      row("stuck", "u1"),
      row("fine", "u1", { rescheduleCount: 0 }),
      row("started", "u1", { parts: [{ title: "x", done: true }] }),
    ]);
    const result = await runEasyStartSweep(NOW);
    expect(simplify).toHaveBeenCalledTimes(1);
    expect(simplify).toHaveBeenCalledWith({
      taskId: "stuck",
      reason: "rescheduled",
      now: NOW,
    });
    expect(result.rewritten).toBe(1);
  });

  it("not started 2 days after its start: re-split as not_started", async () => {
    findMany.mockResolvedValue([
      row("late", "u1", {
        rescheduleCount: 0,
        startDate: new Date("2026-11-20T10:00:00.000Z"),
      }),
    ]);
    await runEasyStartSweep(NOW);
    expect(simplify).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: "late", reason: "not_started" })
    );
  });

  it("no more than 3 rewrites for one person in a run", async () => {
    findMany.mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => row(`t${i}`, "u1"))
    );
    const result = await runEasyStartSweep(NOW);
    expect(simplify).toHaveBeenCalledTimes(3);
    expect(result.rewritten).toBe(3);
  });

  it("a task that could not be rewritten does not stop the run", async () => {
    findMany.mockResolvedValue([row("a", "u1"), row("b", "u2")]);
    simplify.mockRejectedValueOnce(new Error("boom"));
    const result = await runEasyStartSweep(NOW);
    expect(simplify).toHaveBeenCalledTimes(2);
    expect(result.rewritten).toBe(1);
  });

  it("eases the days of people with more than 6 open tasks ahead", async () => {
    groupBy.mockResolvedValue([{ userId: "u1" }, { userId: "u2" }]);
    balance.mockResolvedValueOnce({ moved: 2, actionIds: ["a"] });
    balance.mockResolvedValueOnce({ moved: 0, actionIds: [] });
    const result = await runEasyStartSweep(NOW);
    expect(groupBy.mock.calls[0][0].having).toEqual({
      userId: { _count: { gt: 6 } },
    });
    expect(balance).toHaveBeenCalledWith("u1", NOW);
    expect(balance).toHaveBeenCalledWith("u2", NOW);
    expect(result.eased).toBe(2);
  });
});
