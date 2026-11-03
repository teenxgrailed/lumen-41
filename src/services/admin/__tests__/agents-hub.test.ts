import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

import { getAdminAgentsHub } from "../agents-hub";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    hubAgent: { groupBy: jest.fn() },
    hubItemEvent: { count: jest.fn() },
  },
}));

const db = prisma as unknown as {
  hubAgent: { groupBy: jest.Mock };
  hubItemEvent: { count: jest.Mock };
};
const NOW = newDate("2026-11-03T12:00:00.000Z");

beforeEach(() => {
  jest.clearAllMocks();
  db.hubAgent.groupBy
    .mockResolvedValueOnce([{ userId: "a" }, { userId: "b" }])
    .mockResolvedValueOnce([{ userId: "a" }, { userId: "b" }, { userId: "c" }]);
  db.hubItemEvent.count.mockResolvedValueOnce(9).mockResolvedValueOnce(4);
});

describe("getAdminAgentsHub", () => {
  it("counts accounts, completions by agents and answered escalations", async () => {
    await expect(getAdminAgentsHub(NOW)).resolves.toEqual({
      accountsWithAgent7Days: 2,
      accountsWithAgent30Days: 3,
      itemsCompletedByAgents7Days: 9,
      escalationsAnswered7Days: 4,
      generatedAt: "2026-11-03T12:00:00.000Z",
    });
  });

  it("windows by days, skips the built-in assistant, and reads only counts", async () => {
    await getAdminAgentsHub(NOW);
    const [first, second] = db.hubAgent.groupBy.mock.calls.map((c) => c[0]);
    expect(first.by).toEqual(["userId"]);
    expect(first.where.connectionKey).toEqual({ not: "assistant" });
    const days = (d: Date) =>
      Math.round((NOW.getTime() - d.getTime()) / (24 * 3_600_000));
    expect(days(first.where.createdAt.gte)).toBe(7);
    expect(days(second.where.createdAt.gte)).toBe(30);
    const [completed, answered] = db.hubItemEvent.count.mock.calls.map(
      (c) => c[0].where
    );
    expect(completed).toMatchObject({ type: "completed", actorKind: "agent" });
    expect(answered).toMatchObject({ type: "owner_answer" });
  });
});
