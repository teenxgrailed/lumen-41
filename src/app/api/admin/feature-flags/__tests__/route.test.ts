import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

import { GET as GET_ONE, PATCH } from "../[key]/route";
import { GET as LIST } from "../route";

jest.mock("@/lib/auth/api-auth", () => ({ requireAdmin: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    featureFlag: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    featureFlagOverride: { upsert: jest.fn() },
  },
}));

const ctx = (key: string) => ({ params: Promise.resolve({ key }) });
const patch = (key: string, body: unknown) =>
  PATCH(
    new NextRequest(`http://needt.test/api/admin/feature-flags/${key}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
    ctx(key)
  );

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(requireAdmin).mockResolvedValue(null);
});

describe("admin feature flags", () => {
  it("lists onboarding_v3 as off before any row exists", async () => {
    jest.mocked(prisma.featureFlag.findMany).mockResolvedValue([]);
    const response = await LIST(
      new NextRequest("http://needt.test/api/admin/feature-flags")
    );
    const { flags } = await response.json();
    expect(flags).toContainEqual(
      expect.objectContaining({
        key: "onboarding_v3",
        enabled: false,
        rolloutPercentage: 0,
        known: true,
        persisted: false,
      })
    );
  });

  it("reads a known flag with no row as its default", async () => {
    jest.mocked(prisma.featureFlag.findUnique).mockResolvedValue(null);
    const response = await GET_ONE(
      new NextRequest(
        "http://needt.test/api/admin/feature-flags/onboarding_v3"
      ),
      ctx("onboarding_v3")
    );
    expect(response.status).toBe(200);
    const { flag } = await response.json();
    expect(flag).toMatchObject({ key: "onboarding_v3", enabled: false });
  });

  it("still 404s a key nothing reads", async () => {
    jest.mocked(prisma.featureFlag.findUnique).mockResolvedValue(null);
    const response = await patch("nope", { enabled: true });
    expect(response.status).toBe(404);
    expect(prisma.featureFlag.upsert).not.toHaveBeenCalled();
  });

  it("turns onboarding_v3 on by creating its row", async () => {
    jest.mocked(prisma.featureFlag.upsert).mockResolvedValue({
      key: "onboarding_v3",
      enabled: true,
      rolloutPercentage: 100,
    } as never);
    const response = await patch("onboarding_v3", {
      enabled: true,
      rolloutPercentage: 100,
    });
    expect(response.status).toBe(200);
    expect(prisma.featureFlag.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: "onboarding_v3" },
        create: expect.objectContaining({
          enabled: true,
          rolloutPercentage: 100,
        }),
        update: { enabled: true, rolloutPercentage: 100 },
      })
    );
  });

  it("sets a per-user override on a flag with no row yet", async () => {
    jest.mocked(prisma.featureFlagOverride.upsert).mockResolvedValue({
      enabled: true,
    } as never);
    const response = await patch("onboarding_v3", {
      userId: "u1",
      userEnabled: true,
    });
    expect(response.status).toBe(200);
    expect(prisma.featureFlag.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: "onboarding_v3" }, update: {} })
    );
    expect(prisma.featureFlagOverride.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { flagKey_userId: { flagKey: "onboarding_v3", userId: "u1" } },
      })
    );
  });

  it("refuses a non-admin", async () => {
    jest
      .mocked(requireAdmin)
      .mockResolvedValue(NextResponse.json({}, { status: 403 }));
    const response = await patch("onboarding_v3", { enabled: true });
    expect(response.status).toBe(403);
  });
});
