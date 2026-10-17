import { NextRequest, NextResponse } from "next/server";

import { GET } from "@/app/api/pages/[id]/assets/[assetId]/route";

import { authenticateRequest } from "@/lib/auth/api-auth";
import { resolvePageAccess } from "@/lib/auth/page-auth";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/security/rate-limit", () => ({
  accountRule: jest.fn(() => ({})),
  ipRule: jest.fn(() => ({})),
  enforceRateLimits: jest.fn().mockResolvedValue(null),
  enforceByteBudget: jest.fn().mockResolvedValue(null),
}));
jest.mock("@/lib/auth/api-auth", () => ({ authenticateRequest: jest.fn() }));
jest.mock("@/lib/auth/page-auth", () => ({ resolvePageAccess: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: { pageAsset: { findFirst: jest.fn(), deleteMany: jest.fn() } },
}));

const CSP = "default-src 'none'; sandbox";

function asset(mimeType: string, originalName = "file.bin") {
  const bytes = Buffer.from("payload");
  jest.mocked(prisma.pageAsset.findFirst).mockResolvedValue({
    id: "a1",
    pageId: "p1",
    mimeType,
    originalName,
    size: bytes.byteLength,
    bytes,
  } as never);
}

async function get() {
  return GET(new NextRequest("http://localhost:3000/api/pages/p1/assets/a1"), {
    params: Promise.resolve({ id: "p1", assetId: "a1" }),
  });
}

describe("GET /api/pages/[id]/assets/[assetId]", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest
      .mocked(authenticateRequest)
      .mockResolvedValue({ userId: "u1" } as never);
    jest.mocked(resolvePageAccess).mockResolvedValue({} as never);
  });

  it.each([
    "image/png",
    "image/svg+xml",
    "text/html",
    "application/pdf",
    "application/octet-stream",
  ])("sends the sandbox policy and nosniff for %s", async (mimeType) => {
    asset(mimeType);
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toBe(CSP);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-type")).toBe(mimeType);
  });

  it("serves svg, in any case, as an attachment", async () => {
    for (const type of ["image/svg+xml", "IMAGE/SVG+XML", "image/svg"]) {
      asset(type, "vector.svg");
      const res = await get();
      expect(res.headers.get("content-disposition")).toBe(
        'attachment; filename="vector.svg"'
      );
    }
  });

  it("still shows ordinary pictures inline and everything else as a download", async () => {
    asset("image/png", "a.png");
    expect((await get()).headers.get("content-disposition")).toBe(
      'inline; filename="a.png"'
    );
    asset("text/html", "page.html");
    expect((await get()).headers.get("content-disposition")).toBe(
      'attachment; filename="page.html"'
    );
  });

  it("keeps a quote or newline out of the file name", async () => {
    asset("image/png", 'a"b\r\nc.png');
    expect((await get()).headers.get("content-disposition")).toBe(
      'inline; filename="a_b__c.png"'
    );
  });

  it("sends the same headers on a denied, a missing and an unauthenticated answer", async () => {
    jest.mocked(resolvePageAccess).mockResolvedValue(null as never);
    const denied = await get();
    expect(denied.status).toBe(403);
    expect(denied.headers.get("content-security-policy")).toBe(CSP);
    expect(denied.headers.get("x-content-type-options")).toBe("nosniff");

    jest.mocked(resolvePageAccess).mockResolvedValue({} as never);
    jest.mocked(prisma.pageAsset.findFirst).mockResolvedValue(null);
    const missing = await get();
    expect(missing.status).toBe(404);
    expect(missing.headers.get("content-security-policy")).toBe(CSP);
    expect(missing.headers.get("x-content-type-options")).toBe("nosniff");

    jest.mocked(authenticateRequest).mockResolvedValue({
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    } as never);
    const anonymous = await get();
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("content-security-policy")).toBe(CSP);
    expect(anonymous.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("keeps the page scoping: the lookup is by asset and page, after the access check", async () => {
    asset("image/png");
    await get();
    expect(resolvePageAccess).toHaveBeenCalledWith({ userId: "u1" }, "p1");
    expect(prisma.pageAsset.findFirst).toHaveBeenCalledWith({
      where: { id: "a1", pageId: "p1" },
    });
    jest.mocked(prisma.pageAsset.findFirst).mockClear();
    jest.mocked(resolvePageAccess).mockResolvedValue(null as never);
    await get();
    expect(prisma.pageAsset.findFirst).not.toHaveBeenCalled();
  });
});
