import { getToken } from "next-auth/jwt";
import { NextRequest } from "next/server";

import { POST } from "@/app/api/auth/email-verification/confirm/route";

import { isApiSessionCurrent } from "@/lib/auth/session-version";
import { confirmEmailVerification } from "@/lib/email/email-verification";
import { prisma } from "@/lib/prisma";

jest.mock("next-auth/jwt", () => ({ getToken: jest.fn() }));
jest.mock("@/lib/auth/auth-secret", () => ({ authSecret: () => "secret" }));
jest.mock("@/lib/auth/session-version", () => ({
  isApiSessionCurrent: jest.fn(),
}));
jest.mock("@/lib/email/email-verification", () => ({
  confirmEmailVerification: jest.fn(),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: jest.fn() } },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const call = (body: object) =>
  POST(
    new NextRequest("http://localhost/api/auth/email-verification/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  );
const link = { email: "Victim@Example.com", token: "tok" };

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(confirmEmailVerification)
    .mockResolvedValue({ status: "verified", trial: true });
  jest.mocked(isApiSessionCurrent).mockResolvedValue(true);
  jest
    .mocked(prisma.user.findUnique)
    .mockResolvedValue({ id: "user-1" } as never);
});

describe("POST /api/auth/email-verification/confirm", () => {
  it("a browser with no session is not the signing-up session", async () => {
    jest.mocked(getToken).mockResolvedValue(null);
    await call(link);
    expect(confirmEmailVerification).toHaveBeenCalledWith(
      expect.objectContaining({ sameSession: false })
    );
  });

  it("a live session of another account is not the signing-up session", async () => {
    jest.mocked(getToken).mockResolvedValue({ sub: "someone-else" });
    await call(link);
    expect(confirmEmailVerification).toHaveBeenCalledWith(
      expect.objectContaining({ sameSession: false })
    );
  });

  it("a revoked session of the account is not the signing-up session", async () => {
    jest.mocked(getToken).mockResolvedValue({ sub: "user-1" });
    jest.mocked(isApiSessionCurrent).mockResolvedValue(false);
    await call(link);
    expect(confirmEmailVerification).toHaveBeenCalledWith(
      expect.objectContaining({ sameSession: false })
    );
  });

  it("a live session of the very account is the signing-up session", async () => {
    jest.mocked(getToken).mockResolvedValue({ sub: "user-1" });
    await call(link);
    expect(confirmEmailVerification).toHaveBeenCalledWith(
      expect.objectContaining({ sameSession: true })
    );
  });

  it("passes a strong new password through and refuses a weak one", async () => {
    jest.mocked(getToken).mockResolvedValue(null);
    await call({ ...link, newPassword: "Fresh-Pass-1" });
    expect(confirmEmailVerification).toHaveBeenCalledWith(
      expect.objectContaining({ newPassword: "Fresh-Pass-1" })
    );
    jest.mocked(confirmEmailVerification).mockClear();
    const weak = await call({ ...link, newPassword: "short" });
    expect(weak.status).toBe(400);
    await expect(weak.json()).resolves.toEqual({ status: "weak_password" });
    expect(confirmEmailVerification).not.toHaveBeenCalled();
  });

  it("relays password_required untouched", async () => {
    jest.mocked(getToken).mockResolvedValue(null);
    jest
      .mocked(confirmEmailVerification)
      .mockResolvedValue({ status: "password_required", trial: false });
    const response = await call(link);
    await expect(response.json()).resolves.toEqual({
      status: "password_required",
      trial: false,
    });
  });
});
