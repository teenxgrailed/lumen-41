import { NextRequest } from "next/server";

import { POST } from "@/app/api/billing/trial/route";

import { prisma } from "@/lib/prisma";
import {
  runTrialTransaction,
  startTrialForVerifiedUser,
} from "@/lib/trials/trial-service";

jest.mock("@/lib/auth/api-auth", () => ({
  authenticateRequest: jest.fn().mockResolvedValue({ userId: "user_1" }),
}));
jest.mock("@/lib/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: jest.fn() } },
}));
jest.mock("@/lib/security/rate-limit", () => ({
  accountRule: jest.fn(),
  enforceRateLimits: jest.fn().mockResolvedValue(null),
  ipRule: jest.fn(),
}));
jest.mock("@/lib/trials/trial-service", () => ({
  runTrialTransaction: jest.fn(),
  startTrialForVerifiedUser: jest.fn(),
}));

const request = () =>
  new NextRequest("http://localhost/api/billing/trial", { method: "POST" });

const future = new Date("2999-01-01T00:00:00.000Z");
const past = new Date("2000-01-01T00:00:00.000Z");

describe("POST /api/billing/trial", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      email: "me@example.test",
      emailVerified: new Date("2026-09-01T00:00:00.000Z"),
    });
    (runTrialTransaction as jest.Mock).mockImplementation((fn) => fn({}));
  });

  it("starts the trial through the one trial service", async () => {
    (startTrialForVerifiedUser as jest.Mock).mockResolvedValue({
      endsAt: future,
    });
    const res = (await POST(request()))!;
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      started: true,
      trialEndsAt: future.toISOString(),
    });
    expect(startTrialForVerifiedUser).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ userId: "user_1", email: "me@example.test" })
    );
  });

  it("needs a confirmed address", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      email: "me@example.test",
      emailVerified: null,
    });
    const res = (await POST(request()))!;
    expect(res.status).toBe(400);
    expect(startTrialForVerifiedUser).not.toHaveBeenCalled();
  });

  it("refuses an address that has had its trial", async () => {
    (startTrialForVerifiedUser as jest.Mock).mockResolvedValue(null);
    const res = (await POST(request()))!;
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("TRIAL_USED");
  });

  it("does not restart a trial that has run out", async () => {
    (startTrialForVerifiedUser as jest.Mock).mockResolvedValue({
      endsAt: past,
    });
    const res = (await POST(request()))!;
    expect(res.status).toBe(409);
  });

  it("says so, without detail, when the service fails", async () => {
    (startTrialForVerifiedUser as jest.Mock).mockRejectedValue(
      new Error("db down")
    );
    const res = (await POST(request()))!;
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("db down");
  });
});
