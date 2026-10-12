/**
 * Design v3 ships to everyone through data, not code: the migration turns
 * `design_v3` on at 100 %, and the existing rules then show the v3 sign-in to
 * a stranger and the v3 frame to every signed-in person, while an override
 * set to false still keeps one person on the old design.
 */
import { getServerSession } from "next-auth/next";

import SignInPage from "@/app/(app)/auth/signin/page";
import { readFileSync } from "node:fs";

import { V3SignInRoute } from "@/components/needt3/auth/SignInRoute";
import { SignInRoute } from "@/components/needt/auth/SignInRoute";

import { isFeatureEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: { featureFlag: { findUnique: jest.fn() } },
}));
jest.mock("next-auth/next", () => ({ getServerSession: jest.fn() }));
jest.mock("next/headers", () => ({
  headers: async () => new Headers({ "user-agent": "Mozilla/5.0 (Macintosh)" }),
  cookies: async () => ({ get: () => undefined }),
}));
jest.mock("next/navigation", () => ({
  redirect: jest.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
jest.mock("@/lib/auth/auth-options", () => ({ getAuthOptions: jest.fn() }));
jest.mock("@/lib/needt3/design-flag", () => ({ isDesignV3: jest.fn() }));
jest.mock("@/components/needt3/auth/SignInRoute", () => ({
  V3SignInRoute: () => null,
}));
jest.mock("@/components/needt/auth/SignInRoute", () => ({
  SignInRoute: () => null,
}));
jest.mock("@/lib/logger", () => ({ logger: { error: jest.fn() } }));

const findFlag = jest.mocked(prisma.featureFlag.findUnique);
const EVERYONE = { enabled: true, rolloutPercentage: 100 };

const render = () =>
  SignInPage({ searchParams: Promise.resolve({}) }) as Promise<{
    type: unknown;
  }>;

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getServerSession).mockResolvedValue(null);
});

describe("the design_v3 rollout migration", () => {
  const sql = readFileSync(
    "prisma/migrations/20261012120000_design_v3_everyone/migration.sql",
    "utf8"
  );

  it("turns the flag on at 100 % and is safe to run twice", () => {
    expect(sql).toContain("'design_v3', true, 100");
    expect(sql).toMatch(
      /ON CONFLICT \("key"\) DO UPDATE\s+SET "enabled" = true, "rolloutPercentage" = 100/
    );
  });

  it("touches no override: a person switched off stays off", () => {
    const statements = sql.replace(/^--.*$/gm, "");
    expect(statements).not.toMatch(/FeatureFlagOverride/i);
  });
});

describe("the sign-in page for a signed-out visitor", () => {
  it("is the v3 screen once the flag is on for everyone", async () => {
    findFlag.mockResolvedValue(EVERYONE as never);
    expect((await render()).type).toBe(V3SignInRoute);
  });

  it("stays the old screen if the flag is off (rollback path)", async () => {
    findFlag.mockResolvedValue({
      enabled: false,
      rolloutPercentage: 100,
    } as never);
    expect((await render()).type).toBe(SignInRoute);
  });
});

describe("a signed-in person at 100 %", () => {
  it("without an override gets v3, whatever their bucket", async () => {
    findFlag.mockResolvedValue({ ...EVERYONE, overrides: [] } as never);
    for (const id of ["u1", "u2", "cm0abc", "zzz", "existing-user"]) {
      await expect(isFeatureEnabled("design_v3", id)).resolves.toBe(true);
    }
  });

  it("with an override set to false keeps the old design", async () => {
    findFlag.mockResolvedValue({
      ...EVERYONE,
      overrides: [{ enabled: false }],
    } as never);
    await expect(isFeatureEnabled("design_v3", "u1")).resolves.toBe(false);
  });
});
