import { NextRequest, NextResponse } from "next/server";

import { POST } from "@/app/api/easy-start/proposals/[id]/route";
import { GET } from "@/app/api/easy-start/proposals/route";
import { applyProposal, dismissProposal } from "@/services/easy-start/service";
import { authenticateAgentRequest } from "@/services/ops/http";

import { prisma } from "@/lib/prisma";

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: { easyStartProposal: { findMany: jest.fn() } },
}));
jest.mock("@/services/ops/http", () => ({
  authenticateAgentRequest: jest.fn(),
  opErrorResponse: jest.fn(() =>
    NextResponse.json({ error: "boom" }, { status: 500 })
  ),
}));
jest.mock("@/services/easy-start/service", () => ({
  applyProposal: jest.fn(),
  dismissProposal: jest.fn(),
}));

const auth = jest.mocked(authenticateAgentRequest);
const apply = jest.mocked(applyProposal);
const dismiss = jest.mocked(dismissProposal);
const findMany = prisma.easyStartProposal.findMany as jest.Mock;

const post = async (body: unknown) =>
  (await POST(
    new NextRequest("http://localhost/api/easy-start/proposals/p1", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: "p1" }) }
  )) as Response;

beforeEach(() => {
  jest.clearAllMocks();
  auth.mockResolvedValue({ userId: "u1" } as never);
});

describe("GET /api/easy-start/proposals", () => {
  it("lists the person's pending proposals, newest first", async () => {
    findMany.mockResolvedValue([{ id: "p1", entry: "Open it" }]);
    const res = (await GET(
      new NextRequest("http://localhost/api/easy-start/proposals")
    )) as Response;
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      proposals: [{ id: "p1", entry: "Open it" }],
    });
    expect(findMany.mock.calls[0][0]).toMatchObject({
      where: { userId: "u1", status: "pending" },
      orderBy: { createdAt: "desc" },
    });
  });

  it("answers with the auth response when the request is not authorised", async () => {
    auth.mockResolvedValue({
      response: NextResponse.json({ error: "no" }, { status: 401 }),
    } as never);
    const res = (await GET(
      new NextRequest("http://localhost/api/easy-start/proposals")
    )) as Response;
    expect(res.status).toBe(401);
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe("POST /api/easy-start/proposals/:id", () => {
  it("apply: 200 with the action to undo", async () => {
    apply.mockResolvedValue({ status: "applied", actionId: "a1" });
    const res = await post({ action: "apply" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "applied", actionId: "a1" });
    expect(apply).toHaveBeenCalledWith("p1", "u1");
  });

  it.each([
    ["not_found", 404],
    ["stale", 409],
    ["off", 409],
    ["failed", 422],
  ] as const)("apply %s: %i", async (status, code) => {
    apply.mockResolvedValue({ status });
    expect((await post({ action: "apply" })).status).toBe(code);
  });

  it("dismiss: 200, or 404 when nothing is pending", async () => {
    dismiss.mockResolvedValueOnce(true);
    expect((await post({ action: "dismiss" })).status).toBe(200);
    dismiss.mockResolvedValueOnce(false);
    expect((await post({ action: "dismiss" })).status).toBe(404);
    expect(dismiss).toHaveBeenCalledWith("p1", "u1");
  });

  it("refuses anything else", async () => {
    expect((await post({ action: "delete" })).status).toBe(400);
    expect((await post({})).status).toBe(400);
    expect((await post({ action: "apply", extra: 1 })).status).toBe(400);
    expect(apply).not.toHaveBeenCalled();
  });

  it("asks for write access", async () => {
    apply.mockResolvedValue({ status: "applied", actionId: null });
    await post({ action: "apply" });
    expect(auth.mock.calls[0][2]).toEqual({ write: true });
  });
});
