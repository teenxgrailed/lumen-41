import { NextRequest } from "next/server";

import { DELETE, POST } from "@/app/api/account/deletion/route";
import {
  cancelAccountDeletion,
  scheduleAccountDeletion,
} from "@/services/account/account-deletion";

import { authenticateAccountRequest } from "@/lib/auth/account-request-auth";
import { prisma } from "@/lib/prisma";
import { enqueueAccountDeletion } from "@/lib/queue/enqueue";

/**
 * App Review 5.1.1(v): the reviewer signs in with the sandbox account and
 * must be able to schedule and cancel deletion in the app. The route no
 * longer treats a sandbox account differently (docs/sandbox-accounts.md);
 * the account is protected from the purge instead.
 */
jest.mock("@/lib/auth/account-request-auth", () => ({
  authenticateAccountRequest: jest.fn(),
}));
jest.mock("@/services/account/account-deletion", () => ({
  scheduleAccountDeletion: jest.fn(),
  cancelAccountDeletion: jest.fn(),
}));
jest.mock("@/lib/queue/enqueue", () => ({
  enqueueAccountDeletion: jest.fn(),
  isQueueConfigured: jest.fn(() => true),
}));
jest.mock("@/lib/security/rate-limit", () => ({
  accountRule: jest.fn(() => ({ identifier: "account" })),
  ipRule: jest.fn(() => ({ identifier: "ip" })),
  enforceRateLimits: jest.fn().mockResolvedValue(null),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: jest.fn() } },
}));

const SCHEDULED_FOR = new Date("2026-11-10T09:00:00.000Z");
const userFindUnique = prisma.user.findUnique as unknown as jest.Mock;

function call(method: "POST" | "DELETE") {
  return new NextRequest("http://localhost/api/account/deletion", { method });
}

describe("/api/account/deletion for a sandbox account", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Every lookup says "sandbox": were the route to ask, it would refuse.
    userFindUnique.mockResolvedValue({ sandboxKind: "reviewer" });
    jest.mocked(authenticateAccountRequest).mockResolvedValue({
      user: { id: "sandbox-1", email: "reviewer@needt.test", isActive: true },
      sessionHash: "session-hash",
    });
    jest.mocked(scheduleAccountDeletion).mockResolvedValue({
      id: "request-1",
      status: "SCHEDULED",
      scheduledFor: SCHEDULED_FOR,
    } as never);
    jest.mocked(enqueueAccountDeletion).mockResolvedValue({} as never);
  });

  it("schedules a deletion through the normal re-auth flow", async () => {
    const response = await POST(call("POST"));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      status: "SCHEDULED",
      scheduledFor: SCHEDULED_FOR.toISOString(),
    });
    expect(scheduleAccountDeletion).toHaveBeenCalledWith(
      "sandbox-1",
      "session-hash"
    );
    expect(enqueueAccountDeletion).toHaveBeenCalledWith(
      "request-1",
      SCHEDULED_FOR
    );
    expect(userFindUnique).not.toHaveBeenCalled();
  });

  it("still needs the recent re-authentication", async () => {
    jest
      .mocked(scheduleAccountDeletion)
      .mockRejectedValue(new Error("RECENT_AUTHENTICATION_REQUIRED"));

    const response = await POST(call("POST"));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "RECENT_AUTHENTICATION_REQUIRED",
    });
    expect(enqueueAccountDeletion).not.toHaveBeenCalled();
  });

  it("cancels a scheduled deletion", async () => {
    jest.mocked(cancelAccountDeletion).mockResolvedValue(undefined);

    const response = await DELETE(call("DELETE"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ canceled: true });
    expect(cancelAccountDeletion).toHaveBeenCalledWith("sandbox-1");
  });
});
