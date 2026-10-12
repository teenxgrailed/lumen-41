import { NextRequest } from "next/server";

import { POST } from "@/app/api/auth/register/route";
import { hash } from "bcryptjs";

import { isPublicSignupEnabled } from "@/lib/auth/public-signup";
import { areSignupsOpen } from "@/lib/auth/signups";
import { sendEmailVerification } from "@/lib/email/email-verification";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/auth/public-signup", () => ({
  isPublicSignupEnabled: jest.fn(),
}));
jest.mock("@/lib/auth/signups", () => ({
  ...jest.requireActual("@/lib/auth/signups"),
  areSignupsOpen: jest.fn(),
}));
jest.mock("@/lib/security/rate-limit", () => ({
  accountRule: jest.fn(() => ({ identifier: "account" })),
  ipRule: jest.fn(() => ({ identifier: "ip" })),
  enforceRateLimits: jest.fn().mockResolvedValue(null),
}));
jest.mock("@/lib/email/email-verification", () => ({
  sendEmailVerification: jest.fn(),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: { user: { create: jest.fn() } },
}));
jest.mock("bcryptjs", () => ({ hash: jest.fn() }));

function registrationRequest(body: unknown) {
  return new NextRequest("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("public registration", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(sendEmailVerification).mockResolvedValue({ sent: true });
    jest.mocked(areSignupsOpen).mockResolvedValue(true);
  });

  it("refuses with SIGNUPS_CLOSED while registration is closed", async () => {
    jest.mocked(areSignupsOpen).mockResolvedValue(false);
    jest.mocked(isPublicSignupEnabled).mockResolvedValue(true);

    const response = await POST(
      registrationRequest({ email: "user@example.com", password: "password" })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Registration is closed — join the waitlist at needt.app",
      code: "SIGNUPS_CLOSED",
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("rejects registration when public signup is disabled", async () => {
    jest.mocked(isPublicSignupEnabled).mockResolvedValue(false);

    const response = await POST(
      registrationRequest({ email: "user@example.com", password: "password" })
    );

    expect(response.status).toBe(403);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("validates the submitted account details", async () => {
    jest.mocked(isPublicSignupEnabled).mockResolvedValue(true);

    const response = await POST(
      registrationRequest({ email: "not-an-email", password: "short" })
    );

    expect(response.status).toBe(400);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("creates a credentials account and default user settings", async () => {
    jest.mocked(isPublicSignupEnabled).mockResolvedValue(true);
    jest.mocked(hash).mockResolvedValue("password-hash" as never);
    jest
      .mocked(prisma.user.create)
      .mockResolvedValue({ id: "user-1" } as never);

    const response = await POST(
      registrationRequest({
        email: "  User@Example.com ",
        password: "secure-password",
        name: "New User",
      })
    );

    expect(response.status).toBe(201);
    expect(hash).toHaveBeenCalledWith("secure-password", 12);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "user@example.com",
          name: "New User",
          accounts: {
            create: expect.objectContaining({
              provider: "credentials",
              providerAccountId: "user@example.com",
              id_token: "password-hash",
            }),
          },
          userSettings: {
            create: expect.objectContaining({ theme: "dark", timeZone: "UTC" }),
          },
          autoScheduleSettings: {
            create: expect.objectContaining({
              workDays: "[1,2,3,4,5]",
              workHourStart: 9,
              workHourEnd: 17,
            }),
          },
        }),
      })
    );
    expect(sendEmailVerification).toHaveBeenCalledWith({
      userId: "user-1",
      baseUrl: new URL(process.env.NEXTAUTH_URL ?? "http://localhost").origin,
    });
  });
});
