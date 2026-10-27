import { NextRequest } from "next/server";

import { POST } from "@/app/api/auth/register/route";
import { hash } from "bcryptjs";

import { isPublicSignupEnabled } from "@/lib/auth/public-signup";
import { areSignupsOpen } from "@/lib/auth/signups";
import { replaceUnprovenPassword } from "@/lib/auth/unproven-password";
import { sendEmailVerification } from "@/lib/email/email-verification";
import { isFeatureEnabled } from "@/lib/feature-flags";
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
  prisma: {
    user: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    verificationToken: { deleteMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));
jest.mock("@/lib/auth/unproven-password", () => ({
  ...jest.requireActual("@/lib/auth/unproven-password"),
  replaceUnprovenPassword: jest.fn(),
}));
jest.mock("bcryptjs", () => ({ hash: jest.fn() }));
jest.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: jest.fn() }));

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

  it("starts the account in the browser's zone, week and clock", async () => {
    jest.mocked(isPublicSignupEnabled).mockResolvedValue(true);
    jest.mocked(hash).mockResolvedValue("password-hash" as never);
    jest
      .mocked(prisma.user.create)
      .mockResolvedValue({ id: "user-1" } as never);

    const response = await POST(
      registrationRequest({
        email: "user@example.com",
        password: "secure-password",
        timeZone: "Europe/Berlin",
        locale: "de-DE",
      })
    );

    expect(response.status).toBe(201);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userSettings: {
            create: expect.objectContaining({
              timeZone: "Europe/Berlin",
              weekStartDay: "monday",
              timeFormat: "24h",
              prefs: { tzAutoSet: true },
            }),
          },
        }),
      })
    );
  });

  it("ignores a zone the runtime does not know", async () => {
    jest.mocked(isPublicSignupEnabled).mockResolvedValue(true);
    jest.mocked(hash).mockResolvedValue("password-hash" as never);
    jest
      .mocked(prisma.user.create)
      .mockResolvedValue({ id: "user-1" } as never);

    await POST(
      registrationRequest({
        email: "user@example.com",
        password: "secure-password",
        timeZone: "Mars/Olympus",
        locale: "de-DE",
      })
    );

    const created = jest.mocked(prisma.user.create).mock.calls[0][0] as {
      data: { userSettings: { create: Record<string, unknown> } };
    };
    expect(created.data.userSettings.create).toEqual({
      theme: "dark",
      timeZone: "UTC",
    });
  });

  describe("where the new account goes next (onboarding_v3)", () => {
    beforeEach(() => {
      jest.mocked(isPublicSignupEnabled).mockResolvedValue(true);
      jest.mocked(hash).mockResolvedValue("password-hash" as never);
      jest
        .mocked(prisma.user.create)
        .mockResolvedValue({ id: "user-1" } as never);
    });
    const register = () =>
      POST(
        registrationRequest({
          email: "user@example.com",
          password: "secure-password",
        })
      );

    it("sends it to /start when the flag is on for that user", async () => {
      jest.mocked(isFeatureEnabled).mockResolvedValue(true);
      const response = await register();
      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toMatchObject({ next: "/start" });
      expect(isFeatureEnabled).toHaveBeenCalledWith("onboarding_v3", "user-1");
    });

    it("sends it to /setup when the flag is off", async () => {
      jest.mocked(isFeatureEnabled).mockResolvedValue(false);
      const response = await register();
      await expect(response.json()).resolves.toMatchObject({ next: "/setup" });
    });

    it("falls back to /setup when the flag cannot be read", async () => {
      jest.mocked(isFeatureEnabled).mockRejectedValue(new Error("db down"));
      const response = await register();
      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toMatchObject({ next: "/setup" });
    });
  });

  describe("an address that registered but never confirmed", () => {
    const DAY = 24 * 60 * 60 * 1000;
    const unconfirmed = (ageMs: number, password: string | null = "old") => ({
      id: "user-9",
      emailVerified: null,
      createdAt: new Date(Date.now() - ageMs),
      accounts: [{ provider: "credentials", id_token: password }],
    });

    beforeEach(() => {
      jest.mocked(isPublicSignupEnabled).mockResolvedValue(true);
      jest.mocked(hash).mockResolvedValue("new-hash" as never);
      jest.mocked(prisma.$transaction).mockResolvedValue([] as never);
    });

    const register = () =>
      POST(
        registrationRequest({
          email: "victim@example.com",
          password: "new-password",
        })
      );

    it("after 24 hours a new registration replaces the unproven password and mails a fresh link", async () => {
      jest
        .mocked(prisma.user.findUnique)
        .mockResolvedValue(unconfirmed(25 * 60 * 60 * 1000) as never);
      const response = await register();
      expect(response.status).toBe(201);
      expect(replaceUnprovenPassword).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-9",
          passwordHash: "new-hash",
          action: "auth.unproven_password_replaced",
        })
      );
      expect(sendEmailVerification).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "user-9" })
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it("sooner than that nothing changes and the answer is the same", async () => {
      jest
        .mocked(prisma.user.findUnique)
        .mockResolvedValue(unconfirmed(DAY - 60_000) as never);
      const response = await register();
      expect(response.status).toBe(201);
      await expect(response.json()).resolves.toEqual({ success: true });
      expect(replaceUnprovenPassword).not.toHaveBeenCalled();
      expect(sendEmailVerification).not.toHaveBeenCalled();
    });

    it("a confirmed account is never touched, however old", async () => {
      jest.mocked(prisma.user.findUnique).mockResolvedValue({
        ...unconfirmed(30 * DAY),
        emailVerified: new Date(),
      } as never);
      await register();
      expect(replaceUnprovenPassword).not.toHaveBeenCalled();
    });

    it("an unconfirmed account that has no password (provider sign-up) is left alone", async () => {
      jest
        .mocked(prisma.user.findUnique)
        .mockResolvedValue(unconfirmed(30 * DAY, null) as never);
      await register();
      expect(replaceUnprovenPassword).not.toHaveBeenCalled();
    });
  });
});
