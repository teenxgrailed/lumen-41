import { canUseAgentHub } from "@/lib/entitlements";
import { agentHubEnabled, isFeatureEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";
import { clearTtlCaches, setTtlCachesEnabled } from "@/lib/ttl-cache";

jest.mock("@/lib/entitlements", () => ({
  canUseAgentHub: jest.fn(),
  canUseQuitHabits: jest.fn(),
}));
jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    featureFlag: { findUnique: jest.fn() },
    userSettings: { findUnique: jest.fn() },
  },
}));

const findFlag = prisma.featureFlag.findUnique as jest.Mock;
const hubPlan = canUseAgentHub as jest.Mock;

describe("feature flag cache", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setTtlCachesEnabled(true);
    findFlag.mockResolvedValue({
      key: "x",
      enabled: true,
      rolloutPercentage: 100,
      overrides: [],
    });
  });
  afterEach(() => setTtlCachesEnabled(false));

  it("reads a flag once per person inside 30 s", async () => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate"] });
    try {
      expect(await isFeatureEnabled("x", "u1")).toBe(true);
      expect(await isFeatureEnabled("x", "u1")).toBe(true);
      expect(findFlag).toHaveBeenCalledTimes(1);

      await isFeatureEnabled("x", "u2");
      expect(findFlag).toHaveBeenCalledTimes(2);

      jest.setSystemTime(Date.now() + 31_000);
      await isFeatureEnabled("x", "u1");
      expect(findFlag).toHaveBeenCalledTimes(3);
    } finally {
      jest.useRealTimers();
    }
  });

  it("sees an admin change at once after the cache is cleared", async () => {
    expect(await isFeatureEnabled("x", "u1")).toBe(true);
    findFlag.mockResolvedValue({
      key: "x",
      enabled: false,
      rolloutPercentage: 100,
      overrides: [],
    });
    expect(await isFeatureEnabled("x", "u1")).toBe(true); // still cached
    clearTtlCaches("feature-flags");
    expect(await isFeatureEnabled("x", "u1")).toBe(false);
  });

  it("three simultaneous hub checks cost one flag read and one plan read", async () => {
    hubPlan.mockResolvedValue({ allowed: true });
    const answers = await Promise.all([
      agentHubEnabled("u1"),
      agentHubEnabled("u1"),
      agentHubEnabled("u1"),
    ]);
    expect(answers).toEqual([true, true, true]);
    expect(findFlag).toHaveBeenCalledTimes(1);
    expect(hubPlan).toHaveBeenCalledTimes(1);
  });

  it("does not remember a plan that is not allowed (an upgrade shows at once)", async () => {
    hubPlan.mockResolvedValueOnce({ allowed: false });
    expect(await agentHubEnabled("u1")).toBe(false);
    hubPlan.mockResolvedValueOnce({ allowed: true });
    expect(await agentHubEnabled("u1")).toBe(true);
  });
});
