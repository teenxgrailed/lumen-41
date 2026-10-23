import { NextRequest, NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { enforceRateLimits } from "@/lib/security/rate-limit";

import { POST as rawPost } from "../route";

jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/security/rate-limit", () => ({
  enforceRateLimits: jest.fn(),
  ipRule: jest.fn(() => ({})),
}));

const POST = async (body: string, type = "application/csp-report") => {
  const response = await rawPost(
    new NextRequest("http://localhost/api/csp-report", {
      method: "POST",
      headers: { "content-type": type },
      body,
    })
  );
  if (!response) throw new Error("Expected a route response.");
  return response;
};

const report = JSON.stringify({
  "csp-report": {
    "document-uri": "https://use.needt.app/today?x=1",
    "effective-directive": "connect-src",
    "blocked-uri": "https://tracker.example/collect?id=1",
  },
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(enforceRateLimits).mockResolvedValue(null);
});

describe("POST /api/csp-report", () => {
  it("logs a reduced line per report and answers 204", async () => {
    const response = await POST(report);

    expect(response.status).toBe(204);
    expect(logger.warn).toHaveBeenCalledWith(
      "CSP violation (report-only)",
      expect.objectContaining({
        directive: "connect-src",
        blocked: "https://tracker.example",
        document: "https://use.needt.app/today",
      }),
      "CspReportAPI"
    );
  });

  it("refuses bodies that are not JSON or too large, logging nothing", async () => {
    expect((await POST("not json")).status).toBe(400);
    expect((await POST("x".repeat(20_000))).status).toBe(413);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("caps how many reports one request can log", async () => {
    const batch = Array.from({ length: 25 }, () => ({
      type: "csp-violation",
      body: { effectiveDirective: "img-src", blockedURL: "https://a.example" },
    }));
    await POST(JSON.stringify(batch), "application/reports+json");
    expect(logger.warn).toHaveBeenCalledTimes(10);
  });

  it("returns the limiter's answer when the IP is over its budget", async () => {
    jest
      .mocked(enforceRateLimits)
      .mockResolvedValue(NextResponse.json({}, { status: 429 }));
    expect((await POST(report)).status).toBe(429);
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
