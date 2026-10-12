import { getServerSession } from "next-auth";

import { rolloutBucket } from "@/lib/feature-flags";
import { DESIGN_V3 } from "@/lib/feature-flags-keys";
import { isDesignV3 } from "@/lib/needt3/design-flag";
import { prisma } from "@/lib/prisma";

jest.mock("react", () => ({
  ...jest.requireActual("react"),
  // React's request cache only exists inside a server render; here every
  // call must reach the flag so each case sees its own fixture.
  cache: <T>(fn: T) => fn,
}));

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }));

jest.mock("@/lib/auth/auth-options", () => ({
  getAuthOptions: jest.fn(async () => ({})),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: { featureFlag: { findUnique: jest.fn() } },
}));

jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

const session = getServerSession as jest.Mock;
const findFlag = prisma.featureFlag.findUnique as unknown as jest.Mock;

type Flag = {
  enabled: boolean;
  rolloutPercentage: number;
  overrides: Array<{ enabled: boolean }>;
};

function flag(partial: Partial<Flag>): Flag {
  return { enabled: false, rolloutPercentage: 0, overrides: [], ...partial };
}

/** Find a user id whose bucket for design_v3 satisfies the predicate. */
function userWhere(predicate: (bucket: number) => boolean) {
  for (let i = 0; i < 10_000; i += 1) {
    const id = `user-${i}`;
    if (predicate(rolloutBucket(DESIGN_V3, id))) return id;
  }
  throw new Error("no user id matches");
}

describe("isDesignV3", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("uses the design_v3 key", () => {
    expect(DESIGN_V3).toBe("design_v3");
  });

  it("is off without a session and never reads the flag", async () => {
    session.mockResolvedValue(null);
    await expect(isDesignV3()).resolves.toBe(false);
    expect(findFlag).not.toHaveBeenCalled();
  });

  it("is off when the flag row is missing", async () => {
    session.mockResolvedValue({ user: { id: "u1" } });
    findFlag.mockResolvedValue(null);
    await expect(isDesignV3()).resolves.toBe(false);
    expect(findFlag).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: DESIGN_V3 } })
    );
  });

  it("is off as shipped: disabled at 0 %", async () => {
    session.mockResolvedValue({ user: { id: "u1" } });
    findFlag.mockResolvedValue(flag({}));
    await expect(isDesignV3()).resolves.toBe(false);
  });

  it("an enabled override wins over a disabled flag", async () => {
    session.mockResolvedValue({ user: { id: "owner" } });
    findFlag.mockResolvedValue(flag({ overrides: [{ enabled: true }] }));
    await expect(isDesignV3()).resolves.toBe(true);
  });

  it("a disabled override wins over a 100 % rollout", async () => {
    session.mockResolvedValue({ user: { id: "opted-out" } });
    findFlag.mockResolvedValue(
      flag({
        enabled: true,
        rolloutPercentage: 100,
        overrides: [{ enabled: false }],
      })
    );
    await expect(isDesignV3()).resolves.toBe(false);
  });

  it("rollout lets in exactly the users whose bucket is below the percentage", async () => {
    const inside = userWhere((b) => b < 30);
    const outside = userWhere((b) => b >= 30);
    findFlag.mockResolvedValue(flag({ enabled: true, rolloutPercentage: 30 }));

    session.mockResolvedValue({ user: { id: inside } });
    await expect(isDesignV3()).resolves.toBe(true);

    session.mockResolvedValue({ user: { id: outside } });
    await expect(isDesignV3()).resolves.toBe(false);
  });

  it("rollout is ignored while the flag is disabled", async () => {
    const inside = userWhere((b) => b < 30);
    session.mockResolvedValue({ user: { id: inside } });
    findFlag.mockResolvedValue(flag({ enabled: false, rolloutPercentage: 30 }));
    await expect(isDesignV3()).resolves.toBe(false);
  });

  it("fails closed when the flag cannot be read", async () => {
    session.mockResolvedValue({ user: { id: "u1" } });
    findFlag.mockRejectedValue(new Error("db down"));
    await expect(isDesignV3()).resolves.toBe(false);
  });
});

describe("rolloutBucket", () => {
  it("is stable per key and user, and within 0–99", () => {
    const a = rolloutBucket(DESIGN_V3, "user-a");
    expect(rolloutBucket(DESIGN_V3, "user-a")).toBe(a);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(100);
  });

  it("spreads users roughly evenly", () => {
    let below = 0;
    for (let i = 0; i < 2000; i += 1) {
      if (rolloutBucket(DESIGN_V3, `spread-${i}`) < 50) below += 1;
    }
    expect(below).toBeGreaterThan(850);
    expect(below).toBeLessThan(1150);
  });
});
