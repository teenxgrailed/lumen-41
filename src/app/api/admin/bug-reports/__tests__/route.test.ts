import { NextRequest, NextResponse } from "next/server";

import { listBugReports } from "@/services/bug-reports/bug-report-service";

import { requireAdmin } from "@/lib/auth/api-auth";

import { GET } from "../route";

jest.mock("@/lib/auth/api-auth", () => ({ requireAdmin: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/services/bug-reports/bug-report-service", () => ({
  listBugReports: jest.fn().mockResolvedValue([{ id: "b1" }]),
}));

const request = () =>
  new NextRequest("http://needt.test/api/admin/bug-reports");

describe("GET /api/admin/bug-reports", () => {
  it("refuses a non-admin and reads nothing", async () => {
    (requireAdmin as jest.Mock).mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );
    expect((await GET(request())).status).toBe(403);
    expect(listBugReports).not.toHaveBeenCalled();
  });

  it("returns the reports for an admin", async () => {
    (requireAdmin as jest.Mock).mockResolvedValue(null);
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ reports: [{ id: "b1" }] });
  });
});
