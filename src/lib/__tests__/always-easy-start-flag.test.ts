import { easyStartSettings } from "@/lib/feature-flags";
import { ALWAYS_EASY_START } from "@/lib/feature-flags-keys";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/entitlements", () => ({
  canUseAgentHub: jest.fn(),
  canUseQuitHabits: jest.fn(),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    featureFlag: { findUnique: jest.fn() },
    userSettings: { findUnique: jest.fn() },
  },
}));

const flag = prisma.featureFlag.findUnique as jest.Mock;
const settings = prisma.userSettings.findUnique as jest.Mock;

const flagRow = (enabled: boolean, rolloutPercentage = 100) => ({
  key: ALWAYS_EASY_START,
  enabled,
  rolloutPercentage,
  overrides: [],
});

const OFF = { mode: "off", excludedProjectIds: [] };

beforeEach(() => jest.clearAllMocks());

describe("easyStartSettings", () => {
  it("auto when the kill switch is on and the person picked nothing", async () => {
    flag.mockResolvedValue(flagRow(true));
    settings.mockResolvedValue({
      easyStartMode: "auto",
      easyStartExcludedProjectIds: [],
    });
    expect(await easyStartSettings("u1")).toEqual({
      mode: "auto",
      excludedProjectIds: [],
    });
  });

  it("auto for a person with no settings row yet (the default)", async () => {
    flag.mockResolvedValue(flagRow(true));
    settings.mockResolvedValue(null);
    expect(await easyStartSettings("u1")).toEqual({
      mode: "auto",
      excludedProjectIds: [],
    });
  });

  it("returns suggest, and the excluded projects", async () => {
    flag.mockResolvedValue(flagRow(true));
    settings.mockResolvedValue({
      easyStartMode: "suggest",
      easyStartExcludedProjectIds: ["p1", "p2"],
    });
    expect(await easyStartSettings("u1")).toEqual({
      mode: "suggest",
      excludedProjectIds: ["p1", "p2"],
    });
  });

  it("the person's own off: off", async () => {
    flag.mockResolvedValue(flagRow(true));
    settings.mockResolvedValue({
      easyStartMode: "off",
      easyStartExcludedProjectIds: [],
    });
    expect((await easyStartSettings("u1")).mode).toBe("off");
  });

  it("an unknown stored value falls back to auto, never to something unsafe", async () => {
    flag.mockResolvedValue(flagRow(true));
    settings.mockResolvedValue({
      easyStartMode: "banana",
      easyStartExcludedProjectIds: [],
    });
    expect((await easyStartSettings("u1")).mode).toBe("auto");
  });

  it("kill switch off: off, and the person's row is not even read", async () => {
    flag.mockResolvedValue(flagRow(false));
    expect(await easyStartSettings("u1")).toEqual(OFF);
    expect(settings).not.toHaveBeenCalled();
  });

  it("flag row missing: off", async () => {
    flag.mockResolvedValue(null);
    expect(await easyStartSettings("u1")).toEqual(OFF);
  });

  it("fails closed: no user", async () => {
    expect(await easyStartSettings(null)).toEqual(OFF);
  });

  it("fails closed and says why: a read that throws", async () => {
    flag.mockRejectedValue(new Error("db down"));
    expect(await easyStartSettings("u1")).toEqual(OFF);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("treating it as off"),
      { error: "db down" },
      "feature-flags"
    );
  });
});
