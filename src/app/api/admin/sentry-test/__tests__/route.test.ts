import { NextRequest, NextResponse } from "next/server";

import { GET } from "../route";

const requireAdmin = jest.fn();

jest.mock("@/lib/auth/api-auth", () => ({
  requireAdmin: (req: NextRequest) => requireAdmin(req),
}));

const request = () => new NextRequest("http://localhost/api/admin/sentry-test");

describe("GET /api/admin/sentry-test", () => {
  beforeEach(() => requireAdmin.mockReset());

  it("returns the 403 from requireAdmin to a non-admin and throws nothing", async () => {
    requireAdmin.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );

    const response = await GET(request());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Forbidden" });
  });

  it("throws a dated error for an admin", async () => {
    requireAdmin.mockResolvedValue(null);

    await expect(GET(request())).rejects.toThrow(
      /^Sentry server test \d{4}-\d{2}-\d{2}T/
    );
  });
});
