import { prisma } from "@/lib/prisma";

import { candidateIds } from "../candidates";
import { TUESDAY_10_UTC } from "./helpers";

jest.mock("@/lib/prisma", () => ({
  prisma: { user: { findMany: jest.fn() } },
}));

const NOW = TUESDAY_10_UTC;
const DAY_MS = 24 * 60 * 60 * 1000;

function whereOf(): Record<string, unknown> {
  return jest.mocked(prisma.user.findMany).mock.calls[0][0]!.where as Record<
    string,
    unknown
  >;
}

describe("candidateIds: lapse rules leave out people already handled", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(prisma.user.findMany).mockResolvedValue([] as never);
  });

  it.each([
    ["winback-14d", 15],
    ["winback-30d", 30],
    ["still-want", 90],
  ] as const)(
    "%s excludes anyone with a terminal row from the last %i days",
    async (rule, days) => {
      await candidateIds(rule, NOW);
      const none = (whereOf().emailSends as { none: Record<string, unknown> })
        .none;
      expect(none.ruleKey).toBe(rule);
      expect(none.status).toEqual({ in: ["sent", "skipped", "cancelled"] });
      expect(none.createdAt).toEqual({
        gte: new Date(NOW.getTime() - days * DAY_MS),
      });
    }
  );
});
