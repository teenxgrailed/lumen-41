import { NextRequest } from "next/server";

import { GET, POST } from "@/app/api/email/unsubscribe/route";

import { signUnsubscribeToken } from "@/lib/email/unsubscribe";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/security/rate-limit", () => ({
  ipRule: jest.fn(() => ({ identifier: "ip" })),
  enforceRateLimits: jest.fn().mockResolvedValue(null),
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn(), updateMany: jest.fn() },
    notificationSettings: { updateMany: jest.fn() },
  },
}));

const request = (token: string | null, method: "GET" | "POST") =>
  new NextRequest(
    `http://localhost/api/email/unsubscribe${token ? `?t=${token}` : ""}`,
    { method }
  );

describe("one-click unsubscribe route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(prisma.user.findUnique)
      .mockResolvedValue({ id: "u1" } as never);
  });

  it("GET from the footer link unsubscribes without a login", async () => {
    const response = await GET(
      request(signUnsubscribeToken("u1", "product"), "GET")
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("You are unsubscribed");
    expect(prisma.user.updateMany).toHaveBeenCalledTimes(1);
  });

  it("POST (RFC 8058 one-click) unsubscribes the digest", async () => {
    const response = await POST(
      request(signUnsubscribeToken("u1", "digest"), "POST")
    );
    expect(response.status).toBe(200);
    expect(prisma.notificationSettings.updateMany).toHaveBeenCalledWith({
      where: { userId: "u1" },
      data: { digest: false },
    });
  });

  it("a bad token changes nothing", async () => {
    const get = await GET(request("junk.token", "GET"));
    expect(get.status).toBe(400);
    const post = await POST(request(null, "POST"));
    expect(post.status).toBe(400);
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
    expect(prisma.notificationSettings.updateMany).not.toHaveBeenCalled();
  });
});
