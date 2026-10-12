import { getToken } from "next-auth/jwt";
import { NextRequest } from "next/server";

import { requireAdmin, requireAuth } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

jest.mock("next-auth/jwt", () => ({ getToken: jest.fn() }));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    systemSettings: { findFirst: jest.fn() },
  },
}));

const userModel = prisma.user as unknown as { findUnique: jest.Mock };
const settingsModel = prisma.systemSettings as unknown as {
  findFirst: jest.Mock;
};

function request(path = "/api/private") {
  return new NextRequest(`http://localhost${path}`);
}

describe("shared API authentication", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getToken).mockResolvedValue({ sub: "user-1" });
    userModel.findUnique.mockResolvedValue({
      emailVerified: null,
      isActive: true,
      role: "user",
      sessionVersion: 0,
    });
    settingsModel.findFirst.mockResolvedValue({
      requireEmailVerificationBeforeAccess: false,
    });
  });

  it("rejects a token whose user no longer exists", async () => {
    userModel.findUnique.mockResolvedValue(null);

    const response = await requireAuth(request());

    expect(response?.status).toBe(401);
  });

  it("rejects a token issued before the user signed out everywhere", async () => {
    jest
      .mocked(getToken)
      .mockResolvedValue({ sub: "user-1", sessionVersion: 1 });
    userModel.findUnique.mockResolvedValue({
      emailVerified: null,
      isActive: true,
      role: "admin",
      sessionVersion: 2,
    });

    expect((await requireAuth(request()))?.status).toBe(401);
    expect((await requireAdmin(request("/api/admin")))?.status).toBe(401);
  });

  it("accepts a pre-versioning token while the user is still on version 0", async () => {
    jest.mocked(getToken).mockResolvedValue({ sub: "user-1" });

    await expect(requireAuth(request())).resolves.toBeNull();
  });

  it("rejects a disabled user", async () => {
    userModel.findUnique.mockResolvedValue({ isActive: false, role: "admin" });

    const response = await requireAuth(request());

    expect(response?.status).toBe(401);
  });

  it("uses the current database role instead of a stale admin claim", async () => {
    jest.mocked(getToken).mockResolvedValue({
      sub: "user-1",
      role: "admin",
    });
    userModel.findUnique.mockResolvedValue({
      isActive: true,
      role: "user",
      sessionVersion: 0,
    });

    const response = await requireAdmin(request("/api/admin"));

    expect(response?.status).toBe(403);
  });

  it("allows an active database admin", async () => {
    jest.mocked(getToken).mockResolvedValue({ sub: "admin-1", role: "user" });
    userModel.findUnique.mockResolvedValue({
      emailVerified: null,
      isActive: true,
      role: "admin",
      sessionVersion: 0,
    });

    await expect(requireAdmin(request("/api/admin"))).resolves.toBeNull();
  });

  it("blocks an unverified admin while the access flag is on", async () => {
    userModel.findUnique.mockResolvedValue({
      emailVerified: null,
      isActive: true,
      role: "admin",
      sessionVersion: 0,
    });
    settingsModel.findFirst.mockResolvedValue({
      requireEmailVerificationBeforeAccess: true,
    });

    const response = await requireAdmin(request("/api/admin"));

    expect(response?.status).toBe(403);
    await expect(response?.json()).resolves.toMatchObject({
      code: "EMAIL_VERIFICATION_REQUIRED",
    });
  });
});
