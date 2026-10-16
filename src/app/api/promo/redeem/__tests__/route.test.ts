import { NextRequest, NextResponse } from "next/server";

import { PromoError, redeemPromoCode } from "@/services/promo/redeem";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { enforceRateLimits } from "@/lib/security/rate-limit";

import { POST } from "../route";

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/security/rate-limit", () => ({
  accountRule: jest.fn((id: string, ns: string) => ({ id, ns })),
  ipRule: jest.fn((_r: unknown, ns: string) => ({ ns })),
  enforceRateLimits: jest.fn(),
}));
jest.mock("@/services/promo/redeem", () => {
  const actual = jest.requireActual("@/services/promo/redeem");
  return { ...actual, redeemPromoCode: jest.fn() };
});

const call = (body: unknown) =>
  POST(
    new NextRequest("http://needt.test/api/promo/redeem", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );

beforeEach(() => {
  jest.clearAllMocks();
  (authenticateRequest as jest.Mock).mockResolvedValue({ userId: "u1" });
  (enforceRateLimits as jest.Mock).mockResolvedValue(null);
});

describe("POST /api/promo/redeem", () => {
  it("requires a signed-in person and redeems nothing without one", async () => {
    (authenticateRequest as jest.Mock).mockResolvedValue({
      response: new NextResponse("Unauthorized", { status: 401 }),
    });
    expect((await call({ code: "ABC-1" })).status).toBe(401);
    expect(redeemPromoCode).not.toHaveBeenCalled();
  });

  it("is rate limited per address and per account", async () => {
    const { ipRule, accountRule } = jest.requireMock(
      "@/lib/security/rate-limit"
    );
    (enforceRateLimits as jest.Mock).mockResolvedValue(
      NextResponse.json({ error: "Too many" }, { status: 429 })
    );
    expect((await call({ code: "ABC-1" })).status).toBe(429);
    expect(ipRule).toHaveBeenCalledWith(
      expect.anything(),
      "promo-redeem:ip",
      expect.any(Number),
      expect.any(Number)
    );
    expect(accountRule).toHaveBeenCalledWith(
      "u1",
      "promo-redeem:account",
      expect.any(Number),
      expect.any(Number)
    );
    expect(redeemPromoCode).not.toHaveBeenCalled();
  });

  it("rejects a body with no code", async () => {
    expect((await call({})).status).toBe(400);
    expect((await call("not json")).status).toBe(400);
    expect(redeemPromoCode).not.toHaveBeenCalled();
  });

  it("applies the code for the signed-in person", async () => {
    (redeemPromoCode as jest.Mock).mockResolvedValue({
      kind: "pro_days",
      message: "Pro for 30 days added.",
    });
    const response = await call({ code: "abc-1" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      kind: "pro_days",
      message: "Pro for 30 days added.",
    });
    expect(redeemPromoCode).toHaveBeenCalledWith("u1", "abc-1");
  });

  it.each([
    ["UNKNOWN", 404],
    ["EXPIRED", 410],
    ["USED_UP", 409],
    ["ALREADY_USED", 409],
  ] as const)(
    "answers %s with %i and a readable error",
    async (code, status) => {
      (redeemPromoCode as jest.Mock).mockRejectedValue(new PromoError(code));
      const response = await call({ code: "ABC-1" });
      expect(response.status).toBe(status);
      const body = await response.json();
      expect(body.code).toBe(code);
      expect(body.error).toMatch(/\w+ \w+/);
    }
  );
});
