import { ideaCardsEnabled } from "@/lib/feature-flags";
import { IDEA_CARDS, KNOWN_FEATURE_FLAGS } from "@/lib/feature-flags-keys";
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
  key: IDEA_CARDS,
  enabled,
  rolloutPercentage,
  overrides: [],
});

beforeEach(() => jest.clearAllMocks());

describe("the idea_cards flag", () => {
  it("is a known flag with a description", () => {
    expect(IDEA_CARDS).toBe("idea_cards");
    expect(KNOWN_FEATURE_FLAGS[IDEA_CARDS]).toMatch(/Idea cards/);
  });
});

describe("ideaCardsEnabled", () => {
  it("on when the kill switch is on and the person picked nothing", async () => {
    flag.mockResolvedValue(flagRow(true));
    settings.mockResolvedValue({ ideaCardsEnabled: true });
    expect(await ideaCardsEnabled("u1")).toBe(true);
  });

  it("on for a person with no settings row yet (the default)", async () => {
    flag.mockResolvedValue(flagRow(true));
    settings.mockResolvedValue(null);
    expect(await ideaCardsEnabled("u1")).toBe(true);
  });

  it("the person's own off: off", async () => {
    flag.mockResolvedValue(flagRow(true));
    settings.mockResolvedValue({ ideaCardsEnabled: false });
    expect(await ideaCardsEnabled("u1")).toBe(false);
  });

  it("kill switch off: off, and the person's row is not even read", async () => {
    flag.mockResolvedValue(flagRow(false));
    expect(await ideaCardsEnabled("u1")).toBe(false);
    expect(settings).not.toHaveBeenCalled();
  });

  it("flag row missing: off", async () => {
    flag.mockResolvedValue(null);
    expect(await ideaCardsEnabled("u1")).toBe(false);
  });

  it("fails closed: no user", async () => {
    expect(await ideaCardsEnabled(null)).toBe(false);
    expect(await ideaCardsEnabled(undefined)).toBe(false);
  });

  it("fails closed and says why: a read that throws", async () => {
    flag.mockResolvedValue(flagRow(true));
    settings.mockRejectedValue(new Error("db down"));
    expect(await ideaCardsEnabled("u1")).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("treating them as off"),
      { error: "db down" },
      "feature-flags"
    );
  });
});
