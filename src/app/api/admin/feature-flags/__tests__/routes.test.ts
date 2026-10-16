import { NextRequest, NextResponse } from "next/server";

import { recordAdminAudit } from "@/services/admin/audit";
import { Prisma } from "@prisma/client";

import { requireAdmin } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

import { PATCH } from "../[key]/route";
import { GET } from "../route";

jest.mock("@/lib/auth/api-auth", () => ({ requireAdmin: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/services/admin/audit", () => ({
  adminActorId: jest.fn().mockResolvedValue("admin-1"),
  recordAdminAudit: jest.fn().mockResolvedValue({ id: "a1" }),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    featureFlag: { findMany: jest.fn(), update: jest.fn(), upsert: jest.fn() },
    featureFlagOverride: { upsert: jest.fn() },
  },
}));

const db = prisma as unknown as {
  featureFlag: { findMany: jest.Mock; update: jest.Mock; upsert: jest.Mock };
};

const patch = (key: string, body: unknown) =>
  PATCH(
    new NextRequest(`http://needt.test/api/admin/feature-flags/${key}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ key }) }
  );

beforeEach(() => {
  jest.clearAllMocks();
  (requireAdmin as jest.Mock).mockResolvedValue(null);
  db.featureFlag.update.mockImplementation(async ({ data }) => ({
    key: "x",
    enabled: data.enabled ?? false,
    rolloutPercentage: data.rolloutPercentage ?? 0,
  }));
  db.featureFlag.upsert.mockImplementation(async ({ update }) => ({
    key: "billing_checkout",
    enabled: update.enabled ?? false,
    rolloutPercentage: update.rolloutPercentage ?? 0,
  }));
});

describe("GET /api/admin/feature-flags", () => {
  it("refuses a non-admin", async () => {
    (requireAdmin as jest.Mock).mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );
    const response = await GET(
      new NextRequest("http://needt.test/api/admin/feature-flags")
    );
    expect(response.status).toBe(403);
    expect(db.featureFlag.findMany).not.toHaveBeenCalled();
  });

  it("lists rows and adds the known flags that have none, off", async () => {
    db.featureFlag.findMany.mockResolvedValue([
      {
        key: "design_v3",
        enabled: true,
        rolloutPercentage: 100,
        description: "Design v3",
        updatedAt: new Date("2026-10-12T00:00:00Z"),
      },
    ]);
    const response = await GET(
      new NextRequest("http://needt.test/api/admin/feature-flags")
    );
    const { flags } = await response.json();
    expect(flags.map((f: { key: string }) => f.key)).toEqual([
      "billing_checkout",
      "design_v3",
      "signups_open",
    ]);
    expect(flags[0]).toMatchObject({
      enabled: false,
      rolloutPercentage: 0,
      exists: false,
    });
    expect(flags[1]).toMatchObject({ enabled: true, exists: true });
  });
});

describe("PATCH /api/admin/feature-flags/:key", () => {
  it("refuses a non-admin and changes nothing", async () => {
    (requireAdmin as jest.Mock).mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );
    expect((await patch("editor_v2", { enabled: true })).status).toBe(403);
    expect(db.featureFlag.update).not.toHaveBeenCalled();
  });

  it("clamps the rollout to 0-100 and records the change", async () => {
    const response = await patch("editor_v2", { rolloutPercentage: 250 });
    expect(response.status).toBe(200);
    expect(db.featureFlag.update.mock.calls[0][0].data).toEqual({
      enabled: undefined,
      rolloutPercentage: 100,
    });
    expect(recordAdminAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: "admin-1",
        action: "flag.update",
        details: expect.objectContaining({ rolloutPercentage: 100 }),
      })
    );
  });

  it("creates the row for a known flag that has none", async () => {
    await patch("billing_checkout", { enabled: true });
    expect(db.featureFlag.upsert).toHaveBeenCalled();
    expect(db.featureFlag.upsert.mock.calls[0][0].create).toMatchObject({
      key: "billing_checkout",
      enabled: true,
    });
    expect(db.featureFlag.update).not.toHaveBeenCalled();
  });

  it("answers 404 for an unknown key instead of inventing a flag", async () => {
    db.featureFlag.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("missing", {
        code: "P2025",
        clientVersion: "x",
      })
    );
    expect((await patch("made_up", { enabled: true })).status).toBe(404);
  });

  it("rejects an empty or malformed change", async () => {
    expect((await patch("design_v3", {})).status).toBe(400);
    expect((await patch("design_v3", { rolloutPercentage: "50" })).status).toBe(
      400
    );
  });
});
