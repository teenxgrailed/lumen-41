import { NextRequest, NextResponse } from "next/server";

import { createPromoCode, listPromoCodes } from "@/services/promo/codes";

import { requireAdmin } from "@/lib/auth/api-auth";

import { GET as redemptions } from "../[id]/redemptions/route";
import { PATCH } from "../[id]/route";
import { GET as generate } from "../generate/route";
import { GET, POST } from "../route";

jest.mock("@/lib/auth/api-auth", () => ({ requireAdmin: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/services/admin/audit", () => ({
  adminActorId: jest.fn().mockResolvedValue("admin-1"),
}));
jest.mock("@/services/promo/codes", () => {
  const actual = jest.requireActual("@/services/promo/codes");
  return {
    ...actual,
    listPromoCodes: jest.fn().mockResolvedValue([]),
    createPromoCode: jest.fn(),
    deactivatePromoCode: jest.fn(),
    listPromoRedemptions: jest.fn().mockResolvedValue([]),
  };
});

const url = "http://needt.test/api/admin/promo-codes";
const ctx = { params: Promise.resolve({ id: "p1" }) };
const json = (method: string, body: unknown) =>
  new NextRequest(url, { method, body: JSON.stringify(body) });

beforeEach(() => {
  jest.clearAllMocks();
  (requireAdmin as jest.Mock).mockResolvedValue(null);
});

describe("admin promo-codes API", () => {
  it("refuses a non-admin on every route and touches nothing", async () => {
    (requireAdmin as jest.Mock).mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 })
    );
    const statuses = [
      (await GET(new NextRequest(url))).status,
      (await POST(json("POST", { code: "ABC-1", kind: "lifetime" }))).status,
      (await PATCH(json("PATCH", { active: false }), ctx)).status,
      (await redemptions(new NextRequest(url), ctx)).status,
      (await generate(new NextRequest(url))).status,
    ];
    expect(statuses).toEqual([403, 403, 403, 403, 403]);
    expect(listPromoCodes).not.toHaveBeenCalled();
    expect(createPromoCode).not.toHaveBeenCalled();
  });

  it("creates a code with the signed-in admin as creator", async () => {
    (createPromoCode as jest.Mock).mockResolvedValue({ id: "p1" });
    const response = await POST(
      json("POST", { code: "hello-30", kind: "pro_days", value: 30 })
    );
    expect(response.status).toBe(201);
    expect(createPromoCode).toHaveBeenCalledWith(
      "admin-1",
      expect.objectContaining({ code: "HELLO-30", kind: "pro_days", value: 30 })
    );
  });

  it("rejects a bad code before creating anything", async () => {
    const response = await POST(
      json("POST", { code: "x y", kind: "pro_days", value: 30 })
    );
    expect(response.status).toBe(400);
    expect(createPromoCode).not.toHaveBeenCalled();
  });

  it("only ever deactivates", async () => {
    expect((await PATCH(json("PATCH", { active: true }), ctx)).status).toBe(
      400
    );
  });

  it("hands out a fresh code that matches the pattern", async () => {
    const response = await generate(new NextRequest(url));
    const { code } = await response.json();
    expect(code).toMatch(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/);
  });
});
