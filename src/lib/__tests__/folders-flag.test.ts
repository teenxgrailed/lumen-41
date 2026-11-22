import { foldersV1Enabled } from "../feature-flags";
import { FOLDERS_V1, isKnownFeatureFlag } from "../feature-flags-keys";

/**
 * `folders_v1` fails closed: no user, an unknown flag and a database error
 * all leave Projects on its cards.
 */
const findUnique = jest.fn();
jest.mock("@/lib/prisma", () => ({
  prisma: {
    featureFlag: { findUnique: (...a: unknown[]) => findUnique(...a) },
  },
}));
jest.mock("@/lib/entitlements", () => ({
  canUseAgentHub: jest.fn(),
  canUseQuitHabits: jest.fn(),
}));

beforeEach(() => findUnique.mockReset());

describe("foldersV1Enabled", () => {
  it("is a known flag key", () => {
    expect(FOLDERS_V1).toBe("folders_v1");
    expect(isKnownFeatureFlag(FOLDERS_V1)).toBe(true);
  });

  it("is off with no user, without reading the database", async () => {
    expect(await foldersV1Enabled(null)).toBe(false);
    expect(await foldersV1Enabled(undefined)).toBe(false);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("is off when the flag row is missing or off", async () => {
    findUnique.mockResolvedValueOnce(null);
    expect(await foldersV1Enabled("u1")).toBe(false);
    findUnique.mockResolvedValueOnce({ enabled: false, overrides: [] });
    expect(await foldersV1Enabled("u1")).toBe(false);
  });

  it("is on for a per-user override or a full rollout", async () => {
    findUnique.mockResolvedValueOnce({
      enabled: false,
      overrides: [{ enabled: true }],
    });
    expect(await foldersV1Enabled("u1")).toBe(true);
    findUnique.mockResolvedValueOnce({
      enabled: true,
      rolloutPercentage: 100,
      overrides: [],
    });
    expect(await foldersV1Enabled("u1")).toBe(true);
  });

  it("is off when reading the flag throws", async () => {
    findUnique.mockRejectedValueOnce(new Error("db down"));
    expect(await foldersV1Enabled("u1")).toBe(false);
  });
});
