import { getAgentHubFlag, resetHealthFlagCacheForTests } from "../flags";

const findUnique = jest.fn();
jest.mock("@/lib/prisma", () => ({
  prisma: { featureFlag: { findUnique: (a: unknown) => findUnique(a) } },
}));

describe("getAgentHubFlag", () => {
  beforeEach(() => {
    findUnique.mockReset();
    resetHealthFlagCacheForTests();
  });

  it("reads only the global row, never overrides", async () => {
    findUnique.mockResolvedValue({ enabled: true, rolloutPercentage: 100 });
    await expect(getAgentHubFlag()).resolves.toEqual({
      enabled: true,
      rollout: 100,
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: { key: "agent_hub" },
      select: { enabled: true, rolloutPercentage: true },
    });
  });

  it("reports off when the row is missing", async () => {
    findUnique.mockResolvedValue(null);
    await expect(getAgentHubFlag()).resolves.toEqual({
      enabled: false,
      rollout: 0,
    });
  });

  it("caches for 60 seconds", async () => {
    findUnique.mockResolvedValue({ enabled: true, rolloutPercentage: 50 });
    await getAgentHubFlag();
    await getAgentHubFlag();
    expect(findUnique).toHaveBeenCalledTimes(1);
  });
});
