import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/api-auth";

import { GET } from "../route";

jest.mock("@/lib/auth/api-auth", () => ({ requireAdmin: jest.fn() }));
jest.mock("@/services/admin/overview", () => ({
  getAdminOverview: jest.fn().mockResolvedValue({
    users: { total: 1, newLast7Days: 0 },
    activeTrials: 0,
    plans: { pro: 0, lifetime: 0, free: 1 },
    waitlist: 0,
    generatedAt: "2026-10-16T12:00:00.000Z",
  }),
}));
jest.mock("@/lib/health/build-info", () => ({
  readBuildInfo: jest
    .fn()
    .mockResolvedValue({ buildSha: "a".repeat(40), workerBuildSha: null }),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const request = () => new NextRequest("http://needt.test/api/admin/overview");

describe("GET /api/admin/overview", () => {
  it("refuses a caller requireAdmin refuses, and reads nothing", async () => {
    (requireAdmin as jest.Mock).mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );
    const response = await GET(request());
    expect(response.status).toBe(403);
  });

  it("returns the overview and the build for an admin", async () => {
    (requireAdmin as jest.Mock).mockResolvedValue(null);
    const response = await GET(request());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.overview.users.total).toBe(1);
    expect(body.build.buildSha).toBe("a".repeat(40));
    expect(body.build.workerBuildSha).toBeNull();
  });
});
