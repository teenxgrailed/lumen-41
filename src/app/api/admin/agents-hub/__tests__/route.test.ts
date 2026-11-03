import { NextRequest, NextResponse } from "next/server";

import { getAdminAgentsHub } from "@/services/admin/agents-hub";

import { requireAdmin } from "@/lib/auth/api-auth";

import { GET } from "../route";

jest.mock("@/lib/auth/api-auth", () => ({ requireAdmin: jest.fn() }));
jest.mock("@/services/admin/agents-hub", () => ({
  getAdminAgentsHub: jest.fn().mockResolvedValue({
    accountsWithAgent7Days: 2,
    accountsWithAgent30Days: 5,
    itemsCompletedByAgents7Days: 7,
    escalationsAnswered7Days: 1,
    generatedAt: "2026-11-03T12:00:00.000Z",
  }),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const request = () => new NextRequest("http://needt.test/api/admin/agents-hub");

describe("GET /api/admin/agents-hub", () => {
  beforeEach(() => jest.clearAllMocks());

  it("refuses a caller requireAdmin refuses, and reads nothing", async () => {
    (requireAdmin as jest.Mock).mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );
    const response = await GET(request());
    expect(response.status).toBe(403);
    expect(getAdminAgentsHub).not.toHaveBeenCalled();
  });

  it("returns the counts for an admin", async () => {
    (requireAdmin as jest.Mock).mockResolvedValue(null);
    const response = await GET(request());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.agentsHub.accountsWithAgent30Days).toBe(5);
    expect(body.agentsHub.itemsCompletedByAgents7Days).toBe(7);
  });

  it("answers 500 without leaking the error when the read fails", async () => {
    (requireAdmin as jest.Mock).mockResolvedValue(null);
    (getAdminAgentsHub as jest.Mock).mockRejectedValueOnce(
      new Error("db down")
    );
    const response = await GET(request());
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("db down");
  });
});
