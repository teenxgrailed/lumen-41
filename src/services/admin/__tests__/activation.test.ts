import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

import { getAdminActivation } from "../activation";

jest.mock("@/lib/prisma", () => ({
  prisma: { activationEvent: { groupBy: jest.fn() } },
}));

const groupBy = (
  prisma as unknown as { activationEvent: { groupBy: jest.Mock } }
).activationEvent.groupBy;
const NOW = newDate("2026-11-20T12:00:00.000Z");
const daysAgo = (n: number) => newDate(NOW.getTime() - n * 24 * 3_600_000);
const row = (name: string, userId: string, ago: number) => ({
  name,
  userId,
  _max: { createdAt: daysAgo(ago) },
});

beforeEach(() => jest.clearAllMocks());

describe("getAdminActivation", () => {
  it("counts distinct users per event in the 7 and 14 day windows", async () => {
    groupBy.mockResolvedValue([
      row("keep_applied", "a", 1),
      row("keep_applied", "b", 6),
      row("keep_applied", "c", 10),
      row("task_created", "a", 12),
    ]);
    const result = await getAdminActivation(NOW);
    const by = Object.fromEntries(result.events.map((e) => [e.name, e]));
    expect(by.keep_applied).toMatchObject({ users7Days: 2, users14Days: 3 });
    expect(by.task_created).toMatchObject({ users7Days: 0, users14Days: 1 });
    expect(by.account_created).toMatchObject({ users7Days: 0, users14Days: 0 });
    expect(result.events).toHaveLength(6);
  });

  it("asks only for external users: no admin, no sandbox, 14 days back", async () => {
    groupBy.mockResolvedValue([]);
    await getAdminActivation(NOW);
    const arg = groupBy.mock.calls[0][0];
    expect(arg.by).toEqual(["name", "userId"]);
    expect(arg.where.user).toEqual({
      role: { not: "admin" },
      sandboxKind: null,
    });
    const days = Math.round(
      (NOW.getTime() - arg.where.createdAt.gte.getTime()) / (24 * 3_600_000)
    );
    expect(days).toBe(14);
  });
});
