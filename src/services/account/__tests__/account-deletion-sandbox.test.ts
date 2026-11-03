import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { cancelRecurringBillingForDeletion } from "../account-billing";
import {
  finalizeAccountDeletion,
  finalizeDueAccountDeletions,
} from "../account-deletion";
import { revokeExternalAccessForDeletion } from "../account-external-access";

/**
 * A sandbox account may schedule a deletion (App Review 5.1.1(v)) but is
 * never purged: the purge job skips it, whichever way it is reached.
 */
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("../account-billing", () => ({
  cancelRecurringBillingForDeletion: jest.fn(),
}));
jest.mock("../account-external-access", () => ({
  revokeExternalAccessForDeletion: jest.fn(),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    accountDeletionRequest: {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

const db = prisma as unknown as {
  accountDeletionRequest: {
    updateMany: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
  };
  $transaction: jest.Mock;
};

describe("account deletion purge and sandbox accounts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.accountDeletionRequest.updateMany.mockResolvedValue({ count: 1 });
    db.accountDeletionRequest.update.mockResolvedValue({});
    db.$transaction.mockResolvedValue(undefined);
    jest
      .mocked(cancelRecurringBillingForDeletion)
      .mockResolvedValue(undefined as never);
    jest.mocked(revokeExternalAccessForDeletion).mockResolvedValue({} as never);
  });

  it("skips a sandbox row: nothing is claimed, billed, revoked or erased", async () => {
    db.accountDeletionRequest.findUnique.mockResolvedValue({
      userId: "sandbox-1",
      user: { sandboxKind: "reviewer" },
    });

    await finalizeAccountDeletion("request-1");

    expect(db.$transaction).not.toHaveBeenCalled();
    expect(cancelRecurringBillingForDeletion).not.toHaveBeenCalled();
    expect(revokeExternalAccessForDeletion).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("sandbox account is never purged"),
      expect.objectContaining({ requestId: "request-1", userId: "sandbox-1" }),
      "AccountDeletion"
    );
    // The only write is calling the schedule off, never the PROCESSING claim.
    expect(db.accountDeletionRequest.updateMany).toHaveBeenCalledTimes(1);
    expect(db.accountDeletionRequest.updateMany.mock.calls[0][0]).toMatchObject(
      {
        where: { id: "request-1" },
        data: { status: "CANCELED" },
      }
    );
  });

  it("skips a sandbox row in the sweep without failing it", async () => {
    db.accountDeletionRequest.findMany.mockResolvedValue([{ id: "request-1" }]);
    db.accountDeletionRequest.findUnique.mockResolvedValue({
      userId: "sandbox-1",
      user: { sandboxKind: "reviewer" },
    });

    await expect(finalizeDueAccountDeletions()).resolves.toBe(1);

    expect(db.$transaction).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });

  it("still purges an ordinary account", async () => {
    db.accountDeletionRequest.findUnique.mockResolvedValue({
      userId: "user-1",
      user: { sandboxKind: null },
    });

    await finalizeAccountDeletion("request-2");

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("lets an admin retire a sandbox account on purpose", async () => {
    db.accountDeletionRequest.findUnique.mockResolvedValue({
      userId: "sandbox-1",
      user: { sandboxKind: "reviewer" },
    });

    await finalizeAccountDeletion("request-3", { allowSandbox: true });

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("stays quiet for a sandbox request the reset already cancelled", async () => {
    db.accountDeletionRequest.findUnique.mockResolvedValue({
      userId: "sandbox-1",
      status: "CANCELED",
      user: { sandboxKind: "reviewer" },
    });

    await finalizeAccountDeletion("request-4");

    expect(logger.warn).not.toHaveBeenCalled();
    expect(db.accountDeletionRequest.updateMany).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("leaves a cancelled request cancelled when the pre-read fails", async () => {
    db.accountDeletionRequest.findUnique.mockRejectedValue(
      new Error("connection reset")
    );

    await expect(finalizeAccountDeletion("request-5")).rejects.toThrow(
      "connection reset"
    );

    // The FAILED write only matches a request this call had claimed.
    expect(db.accountDeletionRequest.update).not.toHaveBeenCalled();
    const failed = db.accountDeletionRequest.updateMany.mock.calls.find(
      ([arg]) => arg?.data?.status === "FAILED"
    );
    expect(failed?.[0]).toMatchObject({
      where: { id: "request-5", status: "PROCESSING" },
    });
  });

  it("the worker and the sweep never pass allowSandbox", () => {
    const fs = jest.requireActual<typeof import("fs")>("fs");
    const path = jest.requireActual<typeof import("path")>("path");
    const root = path.resolve(__dirname, "../../..");
    const callers = [
      path.join(root, "services/account/account-deletion.ts"),
      ...fs
        .readdirSync(path.join(root, "worker"), { recursive: true })
        .map(String)
        .filter((f) => f.endsWith(".ts"))
        .map((f) => path.join(root, "worker", f)),
    ];
    for (const file of callers) {
      const text = fs.readFileSync(file, "utf8");
      if (!text.includes("finalizeAccountDeletion(")) continue;
      expect(text).not.toMatch(
        /finalizeAccountDeletion\([^)]*allowSandbox:\s*true/
      );
    }
  });
});
