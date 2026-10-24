import { NextRequest } from "next/server";

import { middleware } from "@/middleware";

describe("report-only Content Security Policy", () => {
  it.each(["/auth/signin", "/privacy", "/calendar"])(
    "is sent on page %s, never enforced",
    async (path) => {
      const response = await middleware(
        new NextRequest(`http://needt.test${path}`)
      );
      const policy = response.headers.get(
        "Content-Security-Policy-Report-Only"
      );
      expect(policy).toContain("default-src 'self'");
      expect(policy).toContain("report-uri /api/csp-report");
      expect(response.headers.get("Content-Security-Policy")).toBeNull();
    }
  );

  it("is left off API responses", async () => {
    const response = await middleware(
      new NextRequest("http://needt.test/api/health")
    );
    expect(
      response.headers.get("Content-Security-Policy-Report-Only")
    ).toBeNull();
  });
});
