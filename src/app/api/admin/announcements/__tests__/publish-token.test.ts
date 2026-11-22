import { NextRequest } from "next/server";

import { recordAdminAudit } from "@/services/admin/audit";
import { setAnnouncementStatus } from "@/services/popups/announcements";

import { prisma } from "@/lib/prisma";

import { POST as PUBLISH } from "../[id]/publish/route";

/*
 * The publish route runs the real `requireAdmin` here: it accepts only a
 * NextAuth session (cookie, or that same session JWT), so an API or MCP
 * bearer token can never publish an announcement.
 */
jest.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: jest.fn() } },
}));
jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock("@/services/admin/audit", () => ({
  adminActorId: jest.fn(),
  recordAdminAudit: jest.fn(),
}));
jest.mock("@/services/popups/announcements");

const ctx = { params: Promise.resolve({ id: "a1" }) };
const publishWith = (authorization: string) =>
  PUBLISH(
    new NextRequest("http://needt.test/api/admin/announcements/a1/publish", {
      method: "POST",
      headers: { authorization, "content-type": "application/json" },
      body: JSON.stringify({ published: true }),
    }),
    ctx
  );

beforeEach(() => {
  jest.clearAllMocks();
  // Even if a lookup happened, it would be an admin: the token must still fail.
  jest.mocked(prisma.user.findUnique).mockResolvedValue({
    role: "admin",
    isActive: true,
    emailVerified: new Date(),
    sandboxKind: null,
    sessionVersion: 0,
  } as never);
});

/**
 * A JWT-shaped token signed with some other key, built at runtime so the
 * source holds no token-shaped literal. Its payload claims an admin.
 */
function foreignJwt(): string {
  const part = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return [
    part({ alg: "HS256" }),
    part({ sub: "admin-1", role: "admin" }),
    Buffer.from("not-a-real-signature").toString("base64url"),
  ].join(".");
}

describe("publish route refuses API and MCP tokens", () => {
  it.each([
    ["a personal needt_ token", `Bearer needt_${"0".repeat(32)}`],
    ["an OAuth access token", "Bearer nat_oauth.access.token-value"],
    ["a JWT signed with another key", `Bearer ${foreignJwt()}`],
  ])("answers 401 to %s and publishes nothing", async (_label, header) => {
    const response = await publishWith(header);
    expect([401, 403]).toContain(response.status);
    expect(response.status).toBe(401);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(setAnnouncementStatus).not.toHaveBeenCalled();
    expect(recordAdminAudit).not.toHaveBeenCalled();
  });
});
