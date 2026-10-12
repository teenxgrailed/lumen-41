import { NextRequest, NextResponse } from "next/server";

import { OPTIONS, POST } from "@/app/api/waitlist/route";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { enforceRateLimits } from "@/lib/security/rate-limit";

jest.mock("@/lib/security/rate-limit", () => ({
  accountRule: jest.fn(() => ({ identifier: "email" })),
  ipRule: jest.fn(() => ({ identifier: "ip" })),
  enforceRateLimits: jest.fn(),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: { waitlist: { create: jest.fn(), updateMany: jest.fn() } },
}));

const create = jest.mocked(prisma.waitlist.create);
const updateMany = jest.mocked(prisma.waitlist.updateMany);

function post(body: unknown, origin: string | null = "https://needt.app") {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (origin) headers.Origin = origin;
  return new NextRequest("https://use.needt.app/api/waitlist", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function preflight(origin: string) {
  return new NextRequest("https://use.needt.app/api/waitlist", {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type",
    },
  });
}

function uniqueViolation(field: string) {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint", {
    code: "P2002",
    clientVersion: "test",
    meta: { target: [field] },
  });
}

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(enforceRateLimits).mockResolvedValue(null);
  create.mockResolvedValue({} as never);
  updateMany.mockResolvedValue({ count: 0 } as never);
});

describe("POST /api/waitlist", () => {
  it("adds a normalised address and answers { ok: true } with CORS", async () => {
    const response = await POST(post({ email: "  Person@Example.COM " }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://needt.app"
    );
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: "person@example.com",
        referredBy: null,
        referralCode: expect.stringMatching(/^[0-9a-f]{10}$/),
      }),
    });
  });

  it("answers an address already on the list exactly like a new one", async () => {
    create.mockRejectedValue(uniqueViolation("email"));

    const response = await POST(post({ email: "person@example.com" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("stores the referral code and credits the referrer", async () => {
    const response = await POST(
      post(
        { email: "friend@example.com", ref: "abc123" },
        "https://www.needt.app"
      )
    );

    expect(response.status).toBe(200);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({ referredBy: "abc123" }),
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { referralCode: "abc123", NOT: { email: "friend@example.com" } },
      data: { referralCount: { increment: 1 } },
    });
  });

  it("retries when the generated referral code collides", async () => {
    create
      .mockRejectedValueOnce(uniqueViolation("referralCode"))
      .mockResolvedValueOnce({} as never);

    const response = await POST(post({ email: "person@example.com" }));

    expect(response.status).toBe(200);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("gives a filled honeypot a quiet success without storing it", async () => {
    const response = await POST(
      post({ email: "bot@example.com", company: "Spam Inc" })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(create).not.toHaveBeenCalled();
    expect(enforceRateLimits).not.toHaveBeenCalled();
  });

  it("strips unknown keys instead of refusing them", async () => {
    const response = await POST(
      post({ email: "person@example.com", utm: "x", source: "landing" })
    );
    expect(response.status).toBe(200);
  });

  it("refuses a bad email", async () => {
    const response = await POST(post({ email: "not-an-email" }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_email" });
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses a referral code longer than 64 characters", async () => {
    const response = await POST(
      post({ email: "person@example.com", ref: "x".repeat(65) })
    );
    expect(response.status).toBe(400);
  });

  it("refuses malformed JSON", async () => {
    const response = await POST(post("{nope"));
    expect(response.status).toBe(400);
  });

  it("refuses a browser on another origin", async () => {
    const response = await POST(
      post({ email: "person@example.com" }, "https://evil.example")
    );

    expect(response.status).toBe(403);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it("accepts a request with no Origin (curl, server to server)", async () => {
    const response = await POST(post({ email: "person@example.com" }, null));

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("passes the rate limiter's refusal through with CORS headers", async () => {
    jest
      .mocked(enforceRateLimits)
      .mockResolvedValue(
        NextResponse.json({ error: "Too many attempts." }, { status: 429 })
      );

    const response = await POST(post({ email: "person@example.com" }));

    expect(response.status).toBe(429);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://needt.app"
    );
    expect(create).not.toHaveBeenCalled();
  });
});

describe("OPTIONS /api/waitlist", () => {
  it("allows the landing origins", () => {
    for (const origin of ["https://needt.app", "https://www.needt.app"]) {
      const response = OPTIONS(preflight(origin));
      expect(response.status).toBe(204);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
      expect(response.headers.get("Access-Control-Allow-Methods")).toContain(
        "POST"
      );
      expect(response.headers.get("Access-Control-Allow-Headers")).toContain(
        "Content-Type"
      );
    }
  });

  it("allows localhost outside production", () => {
    const response = OPTIONS(preflight("http://localhost:5173"));
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "http://localhost:5173"
    );
  });

  it("refuses any other origin", () => {
    const response = OPTIONS(preflight("https://needt.app.evil.example"));
    expect(response.status).toBe(403);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
