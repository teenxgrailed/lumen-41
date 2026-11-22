import { NextRequest } from "next/server";

import { middleware } from "@/middleware";

import { SECURITY_HEADERS, applySecurityHeaders } from "@/lib/security/headers";

jest.mock("@sentry/nextjs", () => ({
  withSentryConfig: (config: unknown) => config,
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const nextConfig = require("../../next.config.js") as {
  headers: () => Promise<
    { source: string; headers: { key: string; value: string }[] }[]
  >;
};

describe("baseline security headers", () => {
  it.each(["/auth/signin", "/calendar", "/api/health"])(
    "middleware sets them on %s",
    async (path) => {
      const response = await middleware(
        new NextRequest(`http://needt.test${path}`)
      );
      expect(response.headers.get("Strict-Transport-Security")).toBe(
        "max-age=31536000"
      );
      expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(response.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
      expect(response.headers.get("Referrer-Policy")).toBe(
        "strict-origin-when-cross-origin"
      );
    }
  );

  it("HSTS covers this host only: no includeSubDomains, no preload", () => {
    const hsts = SECURITY_HEADERS["Strict-Transport-Security"];
    expect(hsts).not.toMatch(/includeSubDomains/i);
    expect(hsts).not.toMatch(/preload/i);
  });

  it("leaves a header a route already chose", () => {
    const headers = new Headers({ "X-Content-Type-Options": "nosniff" });
    headers.set("Referrer-Policy", "no-referrer");
    applySecurityHeaders(headers, "/api/anything");
    expect(headers.get("Referrer-Policy")).toBe("no-referrer");
  });

  it("does not weaken /oauth framing or referrer policy", () => {
    const headers = new Headers();
    applySecurityHeaders(headers, "/oauth/authorize");
    expect(headers.has("X-Frame-Options")).toBe(false);
    expect(headers.has("Referrer-Policy")).toBe(false);
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("next.config.js carries the same values, with /oauth DENY after them", async () => {
    const rules = await nextConfig.headers();
    const global = rules.findIndex(
      (rule) =>
        rule.source === "/:path*" &&
        rule.headers.some((header) => header.key === "X-Frame-Options")
    );
    const oauth = rules.findIndex((rule) => rule.source === "/oauth/:path*");
    expect(global).toBeGreaterThanOrEqual(0);
    // Later rules win for the same key, so /oauth must come after.
    expect(oauth).toBeGreaterThan(global);
    const configured = Object.fromEntries(
      rules[global].headers.map((header) => [header.key, header.value])
    );
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(configured[name]).toBe(value);
    }
    expect(
      rules[oauth].headers.find((header) => header.key === "X-Frame-Options")
        ?.value
    ).toBe("DENY");
  });

  it("keeps the CSP report-only", async () => {
    const response = await middleware(
      new NextRequest("http://needt.test/calendar")
    );
    expect(response.headers.get("Content-Security-Policy")).toBeNull();
    expect(
      response.headers.get("Content-Security-Policy-Report-Only")
    ).toContain("frame-ancestors 'self'");
  });
});
