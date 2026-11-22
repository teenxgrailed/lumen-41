import { getToken } from "next-auth/jwt";
import { NextRequest } from "next/server";

import { POST } from "@/app/api/auth/email-verification/request/route";

import { sendEmailVerification } from "@/lib/email/email-verification";
import { prisma } from "@/lib/prisma";
import { accountRule, enforceRateLimits } from "@/lib/security/rate-limit";

jest.mock("next-auth/jwt", () => ({ getToken: jest.fn() }));
jest.mock("@/lib/auth/auth-secret", () => ({ authSecret: () => "secret" }));
jest.mock("@/lib/email/email-verification", () => ({
  sendEmailVerification: jest.fn(),
}));
jest.mock("@/lib/public-url", () => ({
  publicRequestUrl: () => new URL("http://localhost"),
}));
jest.mock("@/lib/security/rate-limit", () => ({
  accountRule: jest.fn((id: string, name: string) => ({ id, name })),
  ipRule: jest.fn(),
  enforceRateLimits: jest.fn(),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: { user: { findFirst: jest.fn() } },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const call = (body?: object) =>
  POST(
    new NextRequest("http://localhost/api/auth/email-verification/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    })
  );

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(enforceRateLimits).mockResolvedValue(null as never);
  jest
    .mocked(prisma.user.findFirst)
    .mockResolvedValue({ id: "u-typed", email: "typed@x.test" } as never);
});

describe("POST /api/auth/email-verification/request", () => {
  it("mails the typed address, not the stale session user", async () => {
    jest.mocked(getToken).mockResolvedValue({ sub: "stale-user" });
    await call({ email: " Typed@X.test " });
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: "typed@x.test" } })
    );
    expect(sendEmailVerification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u-typed" })
    );
  });

  it("rate-limits on the typed address when a session exists", async () => {
    jest.mocked(getToken).mockResolvedValue({ sub: "stale-user" });
    await call({ email: "typed@x.test" });
    expect(accountRule).toHaveBeenCalledWith(
      "typed@x.test",
      "email-verification:cooldown",
      1,
      60
    );
    expect(enforceRateLimits).toHaveBeenCalledTimes(1);
  });

  it("falls back to the session when no email is given", async () => {
    jest.mocked(getToken).mockResolvedValue({ sub: "session-user" });
    await call();
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "session-user" } })
    );
  });

  it("sends nothing with neither email nor session", async () => {
    jest.mocked(getToken).mockResolvedValue(null);
    jest.mocked(prisma.user.findFirst).mockResolvedValue(null);
    const res = await call();
    expect(await res.json()).toEqual({ sent: true });
    expect(sendEmailVerification).not.toHaveBeenCalled();
  });
});
