import { alwaysEasyStartEnabled } from "@/lib/feature-flags";
import { ALWAYS_EASY_START } from "@/lib/feature-flags-keys";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/entitlements", () => ({
  canUseAgentHub: jest.fn(),
  canUseQuitHabits: jest.fn(),
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

beforeEach(() => jest.clearAllMocks());

describe("alwaysEasyStartEnabled", () => {
  it("on when the kill switch is on and the person has not turned it off", async () => {
    flag.mockResolvedValue(flagRow(true));
    settings.mockResolvedValue({ alwaysEasyStart: true });
    expect(await alwaysEasyStartEnabled("u1")).toBe(true);
  });

  it("on for a person with no settings row yet (the default is on)", async () => {
    flag.mockResolvedValue(flagRow(true));
    settings.mockResolvedValue(null);
    expect(await alwaysEasyStartEnabled("u1")).toBe(true);
  });

  it("kill switch off: off, and the person's row is not even read", async () => {
    flag.mockResolvedValue(flagRow(false));
    expect(await alwaysEasyStartEnabled("u1")).toBe(false);
    expect(settings).not.toHaveBeenCalled();
  });

  it("flag row missing: off", async () => {
    flag.mockResolvedValue(null);
    expect(await alwaysEasyStartEnabled("u1")).toBe(false);
  });

  it("the person's switch off: off", async () => {
    flag.mockResolvedValue(flagRow(true));
    settings.mockResolvedValue({ alwaysEasyStart: false });
    expect(await alwaysEasyStartEnabled("u1")).toBe(false);
  });

  it("fails closed: no user, or a read that throws", async () => {
    expect(await alwaysEasyStartEnabled(null)).toBe(false);
    flag.mockRejectedValue(new Error("db down"));
    expect(await alwaysEasyStartEnabled("u1")).toBe(false);
  });
});
