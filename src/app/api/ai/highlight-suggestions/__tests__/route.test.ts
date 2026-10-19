import { NextRequest } from "next/server";

import { POST } from "@/app/api/ai/highlight-suggestions/route";
import { suggestHighlights } from "@/services/ai/highlight-suggestions";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { enforceRateLimits } from "@/lib/security/rate-limit";

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/security/rate-limit", () => ({
  accountRule: jest.fn(() => ({})),
  enforceRateLimits: jest.fn(),
}));
jest.mock("@/services/ai/highlight-suggestions", () => ({
  ...jest.requireActual("@/services/ai/highlight-suggestions"),
  suggestHighlights: jest.fn(),
}));

const CANDIDATES = [{ id: "t1", title: "Write the report" }];

const post = (body: unknown) =>
  POST(
    new NextRequest("http://localhost/api/ai/highlight-suggestions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    })
  ) as Promise<Response>;

beforeEach(() => {
  jest.clearAllMocks();
  (authenticateRequest as jest.Mock).mockResolvedValue({ userId: "u1" });
  (enforceRateLimits as jest.Mock).mockResolvedValue(null);
});

describe("POST /api/ai/highlight-suggestions", () => {
  it("answers the service's outcome", async () => {
    (suggestHighlights as jest.Mock).mockResolvedValue({
      status: "ready",
      suggestions: [{ taskId: "t1", reason: "Due today." }],
    });
    const res = await post({ date: "2026-10-19", candidates: CANDIDATES });
    expect((await res.json()).suggestions).toHaveLength(1);
    expect(suggestHighlights).toHaveBeenCalledWith(
      "u1",
      "2026-10-19",
      CANDIDATES
    );
  });

  it("validates the day and the candidates before spending anything", async () => {
    expect((await post({ date: "x", candidates: CANDIDATES })).status).toBe(
      400
    );
    expect((await post({ date: "2026-10-19", candidates: [] })).status).toBe(
      400
    );
    expect(suggestHighlights).not.toHaveBeenCalled();
  });

  it("stops at the rate limit", async () => {
    const limited = new Response("{}", { status: 429 });
    (enforceRateLimits as jest.Mock).mockResolvedValue(limited);
    const res = await post({ date: "2026-10-19", candidates: CANDIDATES });
    expect(res.status).toBe(429);
    expect(suggestHighlights).not.toHaveBeenCalled();
  });
});
