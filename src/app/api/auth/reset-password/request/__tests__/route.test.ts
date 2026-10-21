import { NextRequest } from "next/server";

import { POST } from "@/app/api/auth/reset-password/request/route";
import { createHash } from "node:crypto";

import { sendPasswordResetEmail } from "@/lib/email/password-reset";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/security/rate-limit", () => ({
  accountRule: jest.fn(() => ({ identifier: "account" })),
  ipRule: jest.fn(() => ({ identifier: "ip" })),
  enforceRateLimits: jest.fn().mockResolvedValue(null),
}));
jest.mock("@/lib/email/password-reset", () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue({ success: true }),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn(),
    user: { findUnique: jest.fn() },
    passwordReset: { create: jest.fn(), deleteMany: jest.fn() },
  },
}));

const mocked = prisma as unknown as {
  $transaction: jest.Mock;
  user: { findUnique: jest.Mock };
  passwordReset: { create: jest.Mock; deleteMany: jest.Mock };
};

function requestFor(email: string) {
  return new NextRequest("http://localhost/api/auth/reset-password/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

describe("POST /api/auth/reset-password/request", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mocked.passwordReset.deleteMany.mockReturnValue("clear-outstanding");
    mocked.passwordReset.create.mockReturnValue("store-hash");
    mocked.$transaction.mockResolvedValue([]);
  });

  it("emails the raw token, stores only its sha256 and clears older links", async () => {
    mocked.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "person@example.com",
      name: "Person",
      accounts: [{ id: "account-1" }],
    });

    const response = await POST(requestFor("Person@Example.com"));

    expect(response.status).toBe(200);
    const sent = (sendPasswordResetEmail as jest.Mock).mock.calls[0][0] as {
      resetToken: string;
    };
    const stored = mocked.passwordReset.create.mock.calls[0][0] as {
      data: { userId: string; token: string };
    };
    expect(sent.resetToken).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.data.token).toBe(
      createHash("sha256").update(sent.resetToken).digest("hex")
    );
    expect(stored.data.token).not.toBe(sent.resetToken);
    expect(mocked.passwordReset.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", usedAt: null },
    });
    expect(mocked.$transaction).toHaveBeenCalledWith([
      "clear-outstanding",
      "store-hash",
    ]);
  });

  it("stores nothing for an unknown address", async () => {
    mocked.user.findUnique.mockResolvedValue(null);

    const response = await POST(requestFor("nobody@example.com"));

    expect(response.status).toBe(200);
    expect(mocked.passwordReset.create).not.toHaveBeenCalled();
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
  });
});
