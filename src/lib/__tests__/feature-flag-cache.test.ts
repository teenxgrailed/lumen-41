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

  it("never serves a kill switch from the cache", async () => {
    expect(await isFeatureEnabled("day_plan", "u1")).toBe(true);
    findFlag.mockResolvedValue({
      key: "day_plan",
      enabled: false,
      rolloutPercentage: 100,
      overrides: [],
    });
    expect(await isFeatureEnabled("day_plan", "u1")).toBe(false);
    for (const key of ["day_plan_touches", "always_easy_start", "idea_cards"]) {
      findFlag.mockClear();
      await isFeatureEnabled(key, "u1");
      await isFeatureEnabled(key, "u1");
      expect(findFlag).toHaveBeenCalledTimes(2);
    }
  });

  it("reads the hub plan every time, so an upgrade shows at once", async () => {
    hubPlan.mockResolvedValueOnce({ allowed: false });
    expect(await agentHubEnabled("u1")).toBe(false);
    hubPlan.mockResolvedValueOnce({ allowed: true });
    expect(await agentHubEnabled("u1")).toBe(true);
    hubPlan.mockResolvedValueOnce({ allowed: false });
    expect(await agentHubEnabled("u1")).toBe(false); // a downgrade too
    expect(findFlag).toHaveBeenCalledTimes(1); // the flag itself is cached
  });
});
