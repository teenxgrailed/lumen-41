import { NextRequest } from "next/server";

import { GET, PATCH, POST } from "@/app/api/ai/morning-brief/route";
import {
  dismissBrief,
  ensureBrief,
  readBrief,
} from "@/services/ai/morning-brief";
import { SubscriptionPlan } from "@prisma/client";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { getPlan } from "@/lib/entitlements";
import { enforceRateLimits } from "@/lib/security/rate-limit";

jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/entitlements", () => ({ getPlan: jest.fn() }));
jest.mock("@/lib/security/rate-limit", () => ({
  accountRule: jest.fn(() => ({})),
  enforceRateLimits: jest.fn(),
}));
jest.mock("@/services/ai/morning-brief", () => ({
  ...jest.requireActual("@/services/ai/morning-brief"),
  readBrief: jest.fn(),
  ensureBrief: jest.fn(),
  dismissBrief: jest.fn(),
}));

const FACTS = {
  today: ["Write report"],
  openToday: 1,
  doneToday: 0,
  overdue: [],
  overdueCount: 0,
  freeMinutes: 120,
};

const req = (method: string, url: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  jest.clearAllMocks();
  (authenticateRequest as jest.Mock).mockResolvedValue({ userId: "u1" });
  (getPlan as jest.Mock).mockResolvedValue(SubscriptionPlan.PRO);
  (enforceRateLimits as jest.Mock).mockResolvedValue(null);
});

describe("GET /api/ai/morning-brief", () => {
  it("returns the cached brief and never generates", async () => {
    (readBrief as jest.Mock).mockResolvedValue({
      date: "2026-10-18",
      text: "Hi.",
      dismissed: false,
    });
    const res = (await GET(
      req("GET", "/api/ai/morning-brief?date=2026-10-18")
    )) as Response;
    expect((await res.json()).brief.text).toBe("Hi.");
    expect(ensureBrief).not.toHaveBeenCalled();
  });

  it("shows a Free account nothing, without reading", async () => {
    (getPlan as jest.Mock).mockResolvedValue(SubscriptionPlan.FREE);
    const res = (await GET(
      req("GET", "/api/ai/morning-brief?date=2026-10-18")
    )) as Response;
    expect((await res.json()).brief).toBeNull();
    expect(readBrief).not.toHaveBeenCalled();
  });

  it("needs a real day", async () => {
    expect(
      ((await GET(req("GET", "/api/ai/morning-brief?date=now"))) as Response)
        .status
    ).toBe(400);
  });
});

describe("POST /api/ai/morning-brief", () => {
  it("writes the brief for the day from the facts", async () => {
    (ensureBrief as jest.Mock).mockResolvedValue({
      status: "ready",
      brief: { date: "2026-10-18", text: "Hi.", dismissed: false },
    });
    const res = (await POST(
      req("POST", "/api/ai/morning-brief", {
        date: "2026-10-18",
        facts: FACTS,
      })
    )) as Response;
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("ready");
    expect(ensureBrief).toHaveBeenCalledWith("u1", "2026-10-18", FACTS);
  });

  it("refuses bad input before any AI action", async () => {
    expect(
      (
        (await POST(
          req("POST", "/api/ai/morning-brief", {
            date: "2026-10-18",
            facts: { ...FACTS, openToday: -5 },
          })
        )) as Response
      ).status
    ).toBe(400);
    expect(
      (
        (await POST(
          req("POST", "/api/ai/morning-brief", { facts: FACTS })
        )) as Response
      ).status
    ).toBe(400);
    expect(ensureBrief).not.toHaveBeenCalled();
  });

  it("stops at the rate limit", async () => {
    const limited = new Response("slow down", { status: 429 });
    (enforceRateLimits as jest.Mock).mockResolvedValue(limited);
    const res = (await POST(
      req("POST", "/api/ai/morning-brief", {
        date: "2026-10-18",
        facts: FACTS,
      })
    )) as Response;
    expect(res.status).toBe(429);
    expect(ensureBrief).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/ai/morning-brief", () => {
  it("dismisses the day's brief", async () => {
    const res = (await PATCH(
      req("PATCH", "/api/ai/morning-brief", {
        date: "2026-10-18",
        dismissed: true,
      })
    )) as Response;
    expect(res.status).toBe(200);
    expect(dismissBrief).toHaveBeenCalledWith("u1", "2026-10-18");
  });

  it("only knows how to dismiss", async () => {
    const res = (await PATCH(
      req("PATCH", "/api/ai/morning-brief", {
        date: "2026-10-18",
        dismissed: false,
      })
    )) as Response;
    expect(res.status).toBe(400);
  });
});
