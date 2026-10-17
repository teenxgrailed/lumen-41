import { finalizeAccountDeletion } from "@/services/account/account-deletion";

import { prisma } from "@/lib/prisma";

import { recordAdminAudit } from "../audit";
import { AdminActionError, runAdminUserAction } from "../user-actions";

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/trials/trial-service", () => ({
  trialEmailKey: jest.fn((email: string) => `key:${email}`),
}));
jest.mock("@/services/account/account-deletion", () => ({
  finalizeAccountDeletion: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/auth/session-version", () => ({
  revokeAllAccess: jest.fn(() => ["bump", "connectors"]),
}));
jest.mock("../audit", () => ({
  recordAdminAudit: jest.fn().mockResolvedValue({ id: "a1" }),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: jest.fn(), update: jest.fn() },
    trialGrant: { findUnique: jest.fn(), update: jest.fn(), create: jest.fn() },
    subscription: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    accountDeletionRequest: { upsert: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const db = prisma as unknown as {
  user: { findUnique: jest.Mock; update: jest.Mock };
  trialGrant: { findUnique: jest.Mock; update: jest.Mock; create: jest.Mock };
  subscription: { findUnique: jest.Mock; upsert: jest.Mock };
  accountDeletionRequest: { upsert: jest.Mock };
  $transaction: jest.Mock;
};

const ACTOR = "admin-1";
const TARGET = "user-2";

beforeEach(() => {
  jest.clearAllMocks();
  db.user.findUnique.mockResolvedValue({
    id: TARGET,
    email: "pat@example.com",
    role: "user",
  });
  db.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === "function" ? arg(db) : [{ sessionVersion: 2 }, { count: 1 }]
  );
});

async function failure(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error as AdminActionError;
  }
  throw new Error("expected a rejection");
}

describe("make or remove admin", () => {
  it("makes another person admin and records it", async () => {
    await runAdminUserAction(ACTOR, TARGET, {
      action: "set_admin",
      admin: true,
    });
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: TARGET },
      data: { role: "admin" },
    });
    expect(recordAdminAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: ACTOR,
        targetUserId: TARGET,
        action: "user.make_admin",
      }),
      db
    );
  });

  it("refuses to remove your own admin role, and changes nothing", async () => {
    const error = await failure(
      runAdminUserAction(ACTOR, ACTOR, { action: "set_admin", admin: false })
    );
    expect(error.status).toBe(400);
    expect(db.user.update).not.toHaveBeenCalled();
    expect(recordAdminAudit).not.toHaveBeenCalled();
  });

  it("says so when the role is already what was asked", async () => {
    const error = await failure(
      runAdminUserAction(ACTOR, TARGET, { action: "set_admin", admin: false })
    );
    expect(error.status).toBe(409);
  });
});

describe("extend trial", () => {
  it("adds days after the current end when the trial is still running", async () => {
    db.trialGrant.findUnique.mockResolvedValue({
      id: "t1",
      endsAt: new Date(Date.now() + 5 * 86_400_000),
    });
    await runAdminUserAction(ACTOR, TARGET, {
      action: "extend_trial",
      days: 7,
    });
    const endsAt: Date = db.trialGrant.update.mock.calls[0][0].data.endsAt;
    const days = (endsAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(11.9);
    expect(days).toBeLessThan(12.1);
    expect(recordAdminAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user.extend_trial" }),
      db
    );
  });

  it("starts a trial for an account that never had one", async () => {
    db.trialGrant.findUnique.mockResolvedValue(null);
    await runAdminUserAction(ACTOR, TARGET, {
      action: "extend_trial",
      days: 3,
    });
    expect(db.trialGrant.create.mock.calls[0][0].data).toMatchObject({
      userId: TARGET,
      emailKey: "key:pat@example.com",
    });
  });
});

describe("grant and revoke a plan", () => {
  it("grants Lifetime through the manual-grant service and records it", async () => {
    db.subscription.findUnique.mockResolvedValue(null);
    const result = await runAdminUserAction(ACTOR, TARGET, {
      action: "grant_plan",
      kind: "lifetime",
    });
    expect(db.subscription.upsert).toHaveBeenCalled();
    expect(result.message).toMatch(/Lifetime granted/);
    expect(recordAdminAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user.grant_plan" }),
      db
    );
  });

  it("turns a refusal from the billing service into a 409", async () => {
    db.subscription.findUnique.mockResolvedValue({
      plan: "PRO",
      status: "ACTIVE",
      currentPeriodEnd: null,
      creemCustomerId: "cus_1",
      creemSubscriptionId: "sub_1",
      creemProductId: "prod_1",
      stripeCustomerId: null,
      stripePaymentIntentId: null,
    });
    const error = await failure(
      runAdminUserAction(ACTOR, TARGET, {
        action: "grant_plan",
        kind: "lifetime",
      })
    );
    expect(error.status).toBe(409);
    expect(recordAdminAudit).not.toHaveBeenCalled();
  });
});

describe("sign out of all devices", () => {
  it("bumps the session version and the connector tokens, then records it", async () => {
    await runAdminUserAction(ACTOR, TARGET, { action: "sign_out_everywhere" });
    expect(db.$transaction).toHaveBeenCalledWith(["bump", "connectors"]);
    expect(recordAdminAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user.sign_out_everywhere" })
    );
  });
});

describe("delete the account", () => {
  beforeEach(() => {
    db.accountDeletionRequest.upsert.mockResolvedValue({ id: "req-1" });
  });

  it("refuses to delete yourself", async () => {
    const error = await failure(
      runAdminUserAction(ACTOR, ACTOR, {
        action: "delete_account",
        confirmEmail: "pat@example.com",
      })
    );
    expect(error.status).toBe(400);
    expect(finalizeAccountDeletion).not.toHaveBeenCalled();
  });

  it("needs the exact email", async () => {
    const error = await failure(
      runAdminUserAction(ACTOR, TARGET, {
        action: "delete_account",
        confirmEmail: "someone@else.com",
      })
    );
    expect(error.status).toBe(400);
    expect(db.accountDeletionRequest.upsert).not.toHaveBeenCalled();
  });

  it("records first, then runs the existing deletion service", async () => {
    await runAdminUserAction(ACTOR, TARGET, {
      action: "delete_account",
      confirmEmail: "  PAT@example.com ",
    });
    expect(recordAdminAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user.delete" })
    );
    expect(finalizeAccountDeletion).toHaveBeenCalledWith("req-1");
    expect(
      (recordAdminAudit as jest.Mock).mock.invocationCallOrder[0]
    ).toBeLessThan(
      (finalizeAccountDeletion as jest.Mock).mock.invocationCallOrder[0]
    );
  });

  it("tells the admin when the deletion did not finish", async () => {
    (finalizeAccountDeletion as jest.Mock).mockRejectedValueOnce(
      new Error("boom")
    );
    const error = await failure(
      runAdminUserAction(ACTOR, TARGET, {
        action: "delete_account",
        confirmEmail: "pat@example.com",
      })
    );
    expect(error.status).toBe(500);
    expect(error.message).toMatch(/retried/);
  });
});

it("says an unknown account does not exist", async () => {
  db.user.findUnique.mockResolvedValue(null);
  const error = await failure(
    runAdminUserAction(ACTOR, "nobody", { action: "sign_out_everywhere" })
  );
  expect(error.status).toBe(404);
});
