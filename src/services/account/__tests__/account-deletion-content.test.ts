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

/** A transaction client where every model method resolves to an empty list. */
type Call = { model: string; method: string; arg: unknown };

function fakeTransaction(calls: Call[]) {
  const request = {
    id: "request-1",
    user: {
      id: "user-1",
      email: "person@example.com",
      personalWorkspace: null,
      workspaceMemberships: [],
    },
  };
  const models: Record<string, unknown> = {};
  return new Proxy(
    {},
    {
      get(_target, model: string) {
        if (model === "$executeRaw" || model === "$queryRaw") {
          return jest.fn().mockResolvedValue(0);
        }
        if (!models[model]) {
          models[model] = new Proxy(
            {},
            {
              get(_t, method: string) {
                return (arg: unknown) => {
                  calls.push({ model, method, arg });
                  if (
                    model === "accountDeletionRequest" &&
                    method === "findUnique"
                  ) {
                    return Promise.resolve(request);
                  }
                  return Promise.resolve([]);
                };
              },
            }
          );
        }
        return models[model];
      },
    }
  );
}

describe("account deletion of file and waitlist rows", () => {
  const calls: Call[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    calls.length = 0;
    db.accountDeletionRequest.updateMany.mockResolvedValue({ count: 1 });
    db.accountDeletionRequest.findUnique.mockResolvedValue({
      userId: "user-1",
    });
    db.accountDeletionRequest.update.mockResolvedValue({});
    jest.mocked(cancelRecurringBillingForDeletion).mockResolvedValue();
    jest.mocked(revokeExternalAccessForDeletion).mockResolvedValue({} as never);
    db.$transaction.mockImplementation(
      async (run: (tx: unknown) => Promise<void>) => run(fakeTransaction(calls))
    );
  });

  it("blanks task attachment bytes, links and names in shared workspaces", async () => {
    await finalizeAccountDeletion("request-1");

    const call = calls.find(
      (c) => c.model === "taskAttachment" && c.method === "updateMany"
    );
    expect(call?.arg).toEqual({
      where: { userId: "user-1" },
      data: {
        userId: null,
        name: "deleted-attachment",
        mimeType: null,
        size: null,
        bytes: null,
        url: null,
      },
    });
  });

  it("blanks moodboard asset bytes and names in shared workspaces", async () => {
    await finalizeAccountDeletion("request-1");

    const call = calls.find(
      (c) => c.model === "moodboardAsset" && c.method === "updateMany"
    );
    expect(call?.arg).toMatchObject({
      where: { userId: "user-1" },
      data: {
        userId: null,
        originalName: "deleted-asset",
        size: 0,
      },
    });
  });

  it("lets habit tasks in surviving shared workspaces go before the user is deleted", async () => {
    await finalizeAccountDeletion("request-1");

    const release = calls.findIndex(
      (c) =>
        c.model === "task" &&
        c.method === "updateMany" &&
        JSON.stringify(c.arg).includes('"habitId":null')
    );
    const userDelete = calls.findIndex(
      (c) => c.model === "user" && c.method === "delete"
    );
    expect(release).toBeGreaterThanOrEqual(0);
    expect(calls[release].arg).toMatchObject({
      where: { habit: { userId: "user-1" } },
      data: { habitId: null },
    });
    expect(release).toBeLessThan(userDelete);
  });

  it("deletes the app waitlist rows for the account's email", async () => {
    await finalizeAccountDeletion("request-1");

    const call = calls.find(
      (c) => c.model === "appWaitlist" && c.method === "deleteMany"
    );
    expect(call?.arg).toEqual({
      where: { email: { equals: "person@example.com", mode: "insensitive" } },
    });
  });
});
