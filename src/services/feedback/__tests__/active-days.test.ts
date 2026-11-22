import { prisma } from "@/lib/prisma";

import { activityWindowStart, countActiveDays } from "../feedback-service";

jest.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: jest.fn() } }));

const queryRaw = (prisma as unknown as { $queryRaw: jest.Mock }).$queryRaw;

beforeEach(() => {
  jest.resetAllMocks();
  queryRaw.mockResolvedValue([{ days: 6 }]);
});

describe("countActiveDays", () => {
  const NOW = new Date("2026-11-22T15:30:00.000Z");

  it("returns the database's count", async () => {
    expect(await countActiveDays("u1", NOW)).toBe(6);
    queryRaw.mockResolvedValue([]);
    expect(await countActiveDays("u1", NOW)).toBe(0);
  });

  it("starts the window at UTC midnight 13 days ago (14 days with today)", () => {
    expect(activityWindowStart(NOW).toISOString()).toBe(
      "2026-11-09T00:00:00.000Z"
    );
  });

  it("counts only the person's own work: sync and import rows are excluded", async () => {
    await countActiveDays("u1", NOW);
    const query = queryRaw.mock.calls[0][0] as {
      sql: string;
      values: unknown[];
    };
    const sql = query.sql.replace(/\s+/g, " ");
    // task rows come from the actor, minus the sync actions
    expect(sql).toContain('FROM "TaskActivity" WHERE "actorId" = ');
    expect(sql).toMatch(/"action" NOT IN \(\?,\s?\?\)/);
    expect(query.values).toEqual(
      expect.arrayContaining(["IMPORTED", "ARCHIVED_BY_SYNC"])
    );
    // the other sources
    for (const table of ["PageRevision", "TimeEntry", "ActivationEvent"])
      expect(sql).toContain(`FROM "${table}"`);
    // distinct days, as the plain date of the stored (UTC) timestamp
    expect(sql).toContain("COUNT(DISTINCT d)");
    expect(sql).toContain('"createdAt"::date');
    expect(sql).toContain('"startedAt"::date');
    // no session-TimeZone dependence
    expect(sql).not.toContain("AT TIME ZONE");
  });

  it("filters every source by the person and the window start", async () => {
    await countActiveDays("u1", NOW);
    const query = queryRaw.mock.calls[0][0] as { values: unknown[] };
    const users = query.values.filter((v) => v === "u1");
    const starts = query.values.filter(
      (v) => v instanceof Date && v.toISOString() === "2026-11-09T00:00:00.000Z"
    );
    expect(users).toHaveLength(4);
    expect(starts).toHaveLength(4);
  });
});
