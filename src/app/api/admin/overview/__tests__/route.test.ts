import { NextRequest, NextResponse } from "next/server";

import { getOverviewStats } from "@/services/admin/overview-stats-data";

import { requireAdmin } from "@/lib/auth/api-auth";

import { GET } from "../route";

jest.mock("@/lib/auth/api-auth", () => ({ requireAdmin: jest.fn() }));
jest.mock("@/services/admin/overview-stats-data", () => ({
  getOverviewStats: jest
    .fn()
    .mockResolvedValue({ users: { total: 1, newLast7Days: 0 } }),
}));
jest.mock("@/lib/health/build-info", () => ({
  readBuildInfo: jest
    .fn()
    .mockResolvedValue({ buildSha: "a".repeat(40), workerBuildSha: null }),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const request = (query = "") =>
  new NextRequest(`http://needt.test/api/admin/overview${query}`);

describe("GET /api/admin/overview", () => {
  beforeEach(() => jest.clearAllMocks());

  it("refuses a caller requireAdmin refuses, and reads nothing", async () => {
    (requireAdmin as jest.Mock).mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );
    const response = await GET(request());
    expect(response.status).toBe(403);
    expect(getOverviewStats).not.toHaveBeenCalled();
  });

  it("returns the stats and the build for an admin, internal left out", async () => {
    (requireAdmin as jest.Mock).mockResolvedValue(null);
    const response = await GET(request());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.stats.users.total).toBe(1);
    expect(body.build.buildSha).toBe("a".repeat(40));
    expect(body.build.workerBuildSha).toBeNull();
    expect(getOverviewStats).toHaveBeenCalledWith(true);
  });

  it("includes internal accounts only when asked", async () => {
    (requireAdmin as jest.Mock).mockResolvedValue(null);
    await GET(request("?internal=include"));
    expect(getOverviewStats).toHaveBeenCalledWith(false);
  });

  it("answers 500 with a plain message when the read fails", async () => {
    (requireAdmin as jest.Mock).mockResolvedValue(null);
    (getOverviewStats as jest.Mock).mockRejectedValueOnce(new Error("db down"));
    const response = await GET(request());
    expect(response.status).toBe(500);
  });
});
