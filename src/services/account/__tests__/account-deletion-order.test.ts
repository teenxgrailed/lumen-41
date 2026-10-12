import { prisma } from "@/lib/prisma";

import { cancelRecurringBillingForDeletion } from "../account-billing";
import { finalizeAccountDeletion } from "../account-deletion";
import { revokeExternalAccessForDeletion } from "../account-external-access";

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
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

const db = prisma as unknown as {
  accountDeletionRequest: {
    updateMany: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
  };
  $transaction: jest.Mock;
};

describe("account deletion order", () => {
  const order: string[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    order.length = 0;
    db.accountDeletionRequest.updateMany.mockResolvedValue({ count: 1 });
    db.accountDeletionRequest.findUnique.mockResolvedValue({
      userId: "user-1",
    });
    db.accountDeletionRequest.update.mockResolvedValue({});
    jest
      .mocked(cancelRecurringBillingForDeletion)
      .mockImplementation(async () => {
        order.push("billing");
      });
    db.$transaction.mockImplementation(async () => {
      order.push("transaction");
    });
  });

  it("cancels billing, then revokes external access, then erases", async () => {
    jest
      .mocked(revokeExternalAccessForDeletion)
      .mockImplementation(async () => {
        order.push("revoke");
        return {} as never;
      });

    await finalizeAccountDeletion("request-1");

    expect(order).toEqual(["billing", "revoke", "transaction"]);
    expect(revokeExternalAccessForDeletion).toHaveBeenCalledWith("user-1");
  });

  it("erases even when revocation fails outright", async () => {
    jest
      .mocked(revokeExternalAccessForDeletion)
      .mockImplementation(async () => {
        order.push("revoke");
        throw new Error("provider down");
      });

    await finalizeAccountDeletion("request-1");

    expect(order).toEqual(["billing", "revoke", "transaction"]);
  });
});
