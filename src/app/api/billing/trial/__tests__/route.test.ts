import { NextRequest } from "next/server";

import { POST } from "@/app/api/billing/trial/route";

import { prisma } from "@/lib/prisma";
import {
  runTrialTransaction,
  startTrialWithOutcome,
} from "@/lib/trials/trial-service";
import { sendUmamiTrialStarted } from "@/lib/umami-server";

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
jest.mock("@/lib/umami-server", () => ({
  sendUmamiTrialStarted: jest.fn(),
}));
jest.mock("@/lib/trials/trial-service", () => ({
  runTrialTransaction: jest.fn(),
  startTrialWithOutcome: jest.fn(),
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
    (startTrialWithOutcome as jest.Mock).mockResolvedValue({
      grant: { endsAt: future },
      created: true,
    });
    const res = (await POST(request()))!;
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      started: true,
      trialEndsAt: future.toISOString(),
    });
    expect(startTrialWithOutcome).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ userId: "user_1", email: "me@example.test" })
    );
    expect(sendUmamiTrialStarted).toHaveBeenCalledWith("paywall");
  });

  it("does not count a trial that was only read back", async () => {
    (startTrialWithOutcome as jest.Mock).mockResolvedValue({
      grant: { endsAt: future },
      created: false,
    });
    const res = (await POST(request()))!;
    expect(res.status).toBe(200);
    expect(sendUmamiTrialStarted).not.toHaveBeenCalled();
  });

  it("needs a confirmed address", async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      email: "me@example.test",
      emailVerified: null,
    });
    const res = (await POST(request()))!;
    expect(res.status).toBe(400);
    expect(startTrialWithOutcome).not.toHaveBeenCalled();
  });

  it("refuses an address that has had its trial", async () => {
    (startTrialWithOutcome as jest.Mock).mockResolvedValue({
      grant: null,
      created: false,
    });
    const res = (await POST(request()))!;
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("TRIAL_USED");
  });

  it("does not restart a trial that has run out", async () => {
    (startTrialWithOutcome as jest.Mock).mockResolvedValue({
      grant: { endsAt: past },
      created: false,
    });
    const res = (await POST(request()))!;
    expect(res.status).toBe(409);
  });

  it("says so, without detail, when the service fails", async () => {
    (startTrialWithOutcome as jest.Mock).mockRejectedValue(
      new Error("db down")
    );
    const res = (await POST(request()))!;
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("db down");
  });
});
