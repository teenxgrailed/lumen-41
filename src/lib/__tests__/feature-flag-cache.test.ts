import { canUseAgentHub } from "@/lib/entitlements";
import { agentHubEnabled, isFeatureEnabled } from "@/lib/feature-flags";
import {
  CACHEABLE_FLAGS,
  KNOWN_FEATURE_FLAGS,
  UNCACHED_FLAGS,
} from "@/lib/feature-flags-keys";
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
      expect(await isFeatureEnabled("habits_quit", "u1")).toBe(true);
      expect(await isFeatureEnabled("habits_quit", "u1")).toBe(true);
      expect(findFlag).toHaveBeenCalledTimes(1);

      await isFeatureEnabled("habits_quit", "u2");
      expect(findFlag).toHaveBeenCalledTimes(2);

      jest.setSystemTime(Date.now() + 31_000);
      await isFeatureEnabled("habits_quit", "u1");
      expect(findFlag).toHaveBeenCalledTimes(3);
    } finally {
      jest.useRealTimers();
    }
  });

  it("sees an admin change at once after the cache is cleared", async () => {
    expect(await isFeatureEnabled("habits_quit", "u1")).toBe(true);
    findFlag.mockResolvedValue({
      key: "x",
      enabled: false,
      rolloutPercentage: 100,
      overrides: [],
    });
    expect(await isFeatureEnabled("habits_quit", "u1")).toBe(true); // still cached
    clearTtlCaches("feature-flags");
    expect(await isFeatureEnabled("habits_quit", "u1")).toBe(false);
  });

  it("reads every flag outside the allowlist fresh", async () => {
    for (const key of [...UNCACHED_FLAGS, "an_unclassified_flag"]) {
      findFlag.mockClear();
      await isFeatureEnabled(key, "u1");
      await isFeatureEnabled(key, "u1");
      expect(findFlag).toHaveBeenCalledTimes(2);
    }
  });

  it("sees a kill switch turned off on the next call", async () => {
    expect(await isFeatureEnabled("day_plan", "u1")).toBe(true);
    findFlag.mockResolvedValue({
      key: "day_plan",
      enabled: false,
      rolloutPercentage: 100,
      overrides: [],
    });
    expect(await isFeatureEnabled("day_plan", "u1")).toBe(false);
  });

  it("sees an agent_hub override change at once", async () => {
    hubPlan.mockResolvedValue({ allowed: true });
    findFlag.mockResolvedValue({
      key: "agent_hub",
      enabled: false,
      rolloutPercentage: 0,
      overrides: [{ enabled: true }],
    });
    expect(await agentHubEnabled("u1")).toBe(true);
    findFlag.mockResolvedValue({
      key: "agent_hub",
      enabled: false,
      rolloutPercentage: 0,
      overrides: [],
    });
    expect(await agentHubEnabled("u1")).toBe(false);
  });

  it("only caches flags that are known", () => {
    for (const key of CACHEABLE_FLAGS) {
      expect(KNOWN_FEATURE_FLAGS).toHaveProperty([key]);
    }
  });

  it("never caches the workspaces access gate", () => {
    expect(CACHEABLE_FLAGS.has("workspaces")).toBe(false);
    expect(UNCACHED_FLAGS.has("workspaces")).toBe(true);
  });

  it("classifies every known flag exactly once", () => {
    for (const key of Object.keys(KNOWN_FEATURE_FLAGS)) {
      const inCache = CACHEABLE_FLAGS.has(key);
      const inUncached = UNCACHED_FLAGS.has(key);
      expect({ key, once: inCache !== inUncached }).toEqual({
        key,
        once: true,
      });
    }
    for (const key of UNCACHED_FLAGS) {
      expect(KNOWN_FEATURE_FLAGS).toHaveProperty([key]);
    }
    for (const key of CACHEABLE_FLAGS)
      expect(UNCACHED_FLAGS.has(key)).toBe(false);
  });

  it("reads the hub plan every time, so an upgrade shows at once", async () => {
    hubPlan.mockResolvedValueOnce({ allowed: false });
    expect(await agentHubEnabled("u1")).toBe(false);
    hubPlan.mockResolvedValueOnce({ allowed: true });
    expect(await agentHubEnabled("u1")).toBe(true);
    hubPlan.mockResolvedValueOnce({ allowed: false });
    expect(await agentHubEnabled("u1")).toBe(false); // a downgrade too
    expect(findFlag).toHaveBeenCalledTimes(3); // the flag is read fresh too
  });
});
