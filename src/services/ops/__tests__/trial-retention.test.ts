import { addCalendarDays, newDateFromYMD } from "@/lib/date-utils";

import {
  TRIAL_RECORD_RETENTION_DAYS,
  pruneOrphanTrialGrants,
} from "../retention";

const deleteMany = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: { trialGrant: { deleteMany: (args: unknown) => deleteMany(args) } },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe("pruneOrphanTrialGrants", () => {
  beforeEach(() => deleteMany.mockReset());

  it("deletes only orphaned records whose trial ended two years ago", async () => {
    deleteMany.mockResolvedValue({ count: 3 });
    const now = newDateFromYMD(2028, 9, 12);

    await expect(pruneOrphanTrialGrants(now)).resolves.toBe(3);

    expect(TRIAL_RECORD_RETENTION_DAYS).toBe(730);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { userId: null, endsAt: { lt: addCalendarDays(now, -730) } },
    });
  });
});
