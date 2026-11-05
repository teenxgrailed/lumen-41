import { NextRequest, NextResponse } from "next/server";

import { adminActorId } from "@/services/admin/audit";

import { requireAdmin } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

import { GET as GET_ONE, PATCH } from "../[key]/route";
import { GET as LIST } from "../route";

jest.mock("@/lib/auth/api-auth", () => ({ requireAdmin: jest.fn() }));
jest.mock("@/services/admin/audit", () => ({ adminActorId: jest.fn() }));
jest.mock("@/lib/prisma", () => {
  const prisma: Record<string, unknown> = {
    featureFlag: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    featureFlagOverride: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
    featureFlagChange: { create: jest.fn(), findMany: jest.fn() },
    user: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
  };
  prisma.$transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(prisma));
  return { prisma };
});

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
  jest.mocked(adminActorId).mockResolvedValue("admin-1");
  (prisma.$transaction as jest.Mock).mockImplementation(
    (fn: (tx: unknown) => unknown) => fn(prisma)
  );
  jest.mocked(prisma.featureFlagChange.findMany).mockResolvedValue([]);
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
    jest
      .mocked(prisma.user.findUnique)
      .mockResolvedValue({ id: "u1", email: "u1@example.com" } as never);
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

  it("writes a history row with before and after on every flag PATCH", async () => {
    jest
      .mocked(prisma.featureFlag.findUnique)
      .mockResolvedValue({ enabled: false, rolloutPercentage: 10 } as never);
    jest.mocked(prisma.featureFlag.upsert).mockResolvedValue({
      key: "onboarding_v3",
      enabled: true,
      rolloutPercentage: 50,
    } as never);
    await patch("onboarding_v3", { enabled: true, rolloutPercentage: 50 });
    expect(prisma.featureFlagChange.create).toHaveBeenCalledWith({
      data: {
        flagKey: "onboarding_v3",
        actorUserId: "admin-1",
        before: { enabled: false, rolloutPercentage: 10 },
        after: { enabled: true, rolloutPercentage: 50 },
      },
    });
  });

  it("looks an override up by email, never a raw id, and records it", async () => {
    jest
      .mocked(prisma.user.findFirst)
      .mockResolvedValue({ id: "u9", email: "Ann@Example.com" } as never);
    jest.mocked(prisma.featureFlagOverride.findUnique).mockResolvedValue(null);
    jest.mocked(prisma.featureFlagOverride.upsert).mockResolvedValue({
      enabled: true,
    } as never);
    const response = await patch("onboarding_v3", {
      email: " ann@example.com ",
      userEnabled: true,
    });
    expect(response.status).toBe(200);
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: { equals: "ann@example.com", mode: "insensitive" } },
      })
    );
    expect(prisma.featureFlagOverride.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { flagKey_userId: { flagKey: "onboarding_v3", userId: "u9" } },
      })
    );
    expect(prisma.featureFlagChange.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        flagKey: "onboarding_v3",
        actorUserId: "admin-1",
        after: { override: { email: "Ann@Example.com", enabled: true } },
      }),
    });
  });

  it("answers 404 for an email with no account and writes nothing", async () => {
    jest.mocked(prisma.user.findFirst).mockResolvedValue(null);
    const response = await patch("onboarding_v3", {
      email: "nobody@example.com",
      userEnabled: true,
    });
    expect(response.status).toBe(404);
    expect(prisma.featureFlagOverride.upsert).not.toHaveBeenCalled();
    expect(prisma.featureFlagChange.create).not.toHaveBeenCalled();
  });

  it("sets an override for the calling admin with self", async () => {
    jest
      .mocked(prisma.user.findUnique)
      .mockResolvedValue({ id: "admin-1", email: "me@needt.app" } as never);
    jest.mocked(prisma.featureFlagOverride.findUnique).mockResolvedValue(null);
    jest.mocked(prisma.featureFlagOverride.upsert).mockResolvedValue({
      enabled: false,
    } as never);
    await patch("onboarding_v3", { self: true, userEnabled: false });
    expect(prisma.featureFlagOverride.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          flagKey_userId: { flagKey: "onboarding_v3", userId: "admin-1" },
        },
        update: { enabled: false },
      })
    );
  });

  it("removes an override and records the removal", async () => {
    jest
      .mocked(prisma.user.findUnique)
      .mockResolvedValue({ id: "u9", email: "ann@example.com" } as never);
    jest
      .mocked(prisma.featureFlagOverride.findUnique)
      .mockResolvedValue({ enabled: true } as never);
    const response = await patch("onboarding_v3", {
      userId: "u9",
      remove: true,
    });
    expect(response.status).toBe(200);
    expect(prisma.featureFlagOverride.delete).toHaveBeenCalled();
    expect(prisma.featureFlagChange.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        before: { override: { email: "ann@example.com", enabled: true } },
        after: { override: null, email: "ann@example.com" },
      }),
    });
  });

  it("returns the last 20 changes with the flag", async () => {
    jest.mocked(prisma.featureFlag.findUnique).mockResolvedValue(null);
    await GET_ONE(
      new NextRequest(
        "http://needt.test/api/admin/feature-flags/onboarding_v3"
      ),
      ctx("onboarding_v3")
    );
    expect(prisma.featureFlagChange.findMany).toHaveBeenCalledWith({
      where: { flagKey: "onboarding_v3" },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  });

  it("refuses a non-admin on every route and writes nothing", async () => {
    jest
      .mocked(requireAdmin)
      .mockResolvedValue(NextResponse.json({}, { status: 403 }));
    const request = new NextRequest(
      "http://needt.test/api/admin/feature-flags/onboarding_v3"
    );
    expect((await GET_ONE(request, ctx("onboarding_v3"))).status).toBe(403);
    expect((await LIST(request)).status).toBe(403);
    expect(
      (await patch("onboarding_v3", { self: true, userEnabled: true })).status
    ).toBe(403);
    expect(prisma.featureFlagChange.create).not.toHaveBeenCalled();
    expect(prisma.featureFlagOverride.upsert).not.toHaveBeenCalled();
  });

  it("refuses a non-admin", async () => {
    jest
      .mocked(requireAdmin)
      .mockResolvedValue(NextResponse.json({}, { status: 403 }));
    const response = await patch("onboarding_v3", { enabled: true });
    expect(response.status).toBe(403);
  });
});
