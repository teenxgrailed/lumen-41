import { prisma } from "@/lib/prisma";

import { balanceOverloadedDays, simplifyTask, stampLookedAt } from "../service";
import { resetSweepCursor, runEasyStartSweep } from "../sweep";

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
  settingsOff: { userSettings: { is: { easyStartMode: "off" } } },
  taskSelect: {},
  simplifyTask: jest.fn(),
  stampLookedAt: jest.fn(),
  balanceOverloadedDays: jest.fn(),
}));

const flag = prisma.featureFlag.findUnique as jest.Mock;
const findMany = prisma.task.findMany as jest.Mock;
const groupBy = prisma.task.groupBy as jest.Mock;
const simplify = jest.mocked(simplifyTask);
const stamp = jest.mocked(stampLookedAt);
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
  jest.resetAllMocks();
  resetSweepCursor();
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

  it("asks only for tasks of people whose mode is not off", async () => {
    await runEasyStartSweep(NOW);
    const off = { userSettings: { is: { easyStartMode: "off" } } };
    expect(findMany.mock.calls[0][0].where.user).toEqual({ NOT: off });
    expect(groupBy.mock.calls[0][0].where.user).toEqual({ NOT: off });
  });

  it("the candidate query leaves out ticked, archived, recurring and synced tasks", async () => {
    await runEasyStartSweep(NOW);
    const where = findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      status: "todo",
      isArchived: false,
      trashedAt: null,
      somedayAt: null,
      isSample: false,
      isRecurring: false,
      habitId: null,
      externalTaskId: null,
      parts: { none: { done: true } },
    });
  });

  it("re-splits a task moved once, and stamps the candidates it will not change", async () => {
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
    // The other two leave the candidate set instead of being read forever.
    expect(stamp.mock.calls.map(([task]) => task.id)).toEqual([
      "fine",
      "started",
    ]);
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

  it("no more than 3 rewrites for one person in a run, and the rest are not stamped", async () => {
    findMany.mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => row(`t${i}`, "u1"))
    );
    const result = await runEasyStartSweep(NOW);
    expect(simplify).toHaveBeenCalledTimes(3);
    expect(result.rewritten).toBe(3);
    // Held back by the cap, not judged: they stay candidates for the next run.
    expect(stamp).not.toHaveBeenCalled();
  });

  it("a proposal in suggest mode counts as a rewrite", async () => {
    findMany.mockResolvedValue([row("a", "u1")]);
    simplify.mockResolvedValue({
      status: "proposed",
      proposalId: "p1",
      source: "ai",
    });
    expect((await runEasyStartSweep(NOW)).rewritten).toBe(1);
  });

  it("a task that could not be rewritten does not stop the run, and leaves the set", async () => {
    findMany.mockResolvedValue([row("a", "u1"), row("b", "u2")]);
    simplify.mockRejectedValueOnce(new Error("boom"));
    const result = await runEasyStartSweep(NOW);
    expect(simplify).toHaveBeenCalledTimes(2);
    expect(result.rewritten).toBe(1);
    expect(stamp.mock.calls.map(([task]) => task.id)).toEqual(["a"]);
  });

  it("pages through more than 200 ineligible tasks and still reaches the stuck one behind them", async () => {
    const ineligible = Array.from({ length: 250 }, (_, i) =>
      row(`a${String(i).padStart(3, "0")}`, "u1", { rescheduleCount: 0 })
    );
    const all = [...ineligible, row("z-stuck", "u2")];
    findMany.mockImplementation(
      async (args: { where: { id?: { gt: string } }; take: number }) => {
        const after = args.where.id?.gt;
        return all.filter((r) => !after || r.id > after).slice(0, args.take);
      }
    );

    const result = await runEasyStartSweep(NOW);

    expect(result.rewritten).toBe(1);
    expect(simplify).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: "z-stuck" })
    );
    expect(stamp).toHaveBeenCalledTimes(250);
    // the second page asked for rows after the first page's last id
    expect(findMany.mock.calls[1][0].where.id).toEqual({ gt: "a199" });
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

  it("the crowded-day scan resumes after the last account of a full page", async () => {
    const full = Array.from({ length: 100 }, (_, i) => ({
      userId: `u${String(i).padStart(3, "0")}`,
    }));
    groupBy
      .mockResolvedValueOnce(full)
      .mockResolvedValueOnce([{ userId: "u200" }]);
    await runEasyStartSweep(NOW);
    expect(groupBy.mock.calls[1][0].where.userId).toEqual({ gt: "u099" });
    expect(balance).toHaveBeenCalledTimes(101);

    // The list ended, so the next run starts again from the first account.
    groupBy.mockClear();
    groupBy.mockResolvedValue([]);
    await runEasyStartSweep(NOW);
    expect(groupBy.mock.calls[0][0].where.userId).toEqual({ not: null });
  });
});
