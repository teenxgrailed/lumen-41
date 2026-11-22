import { markEmailVerifiedAndStartTrial } from "@/lib/trials/trial-service";
import { sendUmamiTrialStarted } from "@/lib/umami-server";

const tx = {
  user: { update: jest.fn() },
  subscription: { upsert: jest.fn() },
  trialGrant: {
    findFirst: jest.fn(),
    createMany: jest.fn(),
    findUnique: jest.fn(),
  },
};

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn((operation: (client: typeof tx) => unknown) =>
      operation(tx)
    ),
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/umami-server", () => ({
  sendUmamiTrialStarted: jest.fn(),
}));

describe("trial_started from the OAuth path", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RATE_LIMIT_HASH_SECRET = "trial-test-secret";
    tx.user.update.mockResolvedValue({
      id: "user-1",
      email: "person@example.com",
      emailVerified: new Date(),
    });
    tx.subscription.upsert.mockResolvedValue({});
    tx.trialGrant.findFirst.mockResolvedValue(null);
    tx.trialGrant.createMany.mockResolvedValue({ count: 1 });
    tx.trialGrant.findUnique.mockResolvedValue({
      id: "trial-1",
      userId: "user-1",
    });
  });

  const run = () =>
    markEmailVerifiedAndStartTrial({
      userId: "user-1",
      email: "person@example.com",
    });

  it("is reported once for a new grant", async () => {
    await run();
    expect(sendUmamiTrialStarted).toHaveBeenCalledTimes(1);
    expect(sendUmamiTrialStarted).toHaveBeenCalledWith("oauth");
  });

  it("is not reported for a grant that was only read back", async () => {
    tx.trialGrant.findFirst.mockResolvedValue({
      id: "trial-1",
      userId: "user-1",
    });
    await run();
    expect(sendUmamiTrialStarted).not.toHaveBeenCalled();
  });

  it("is not reported when another account holds the address's trial", async () => {
    tx.trialGrant.findFirst.mockResolvedValue({
      id: "trial-0",
      userId: "someone-else",
    });
    await run();
    expect(sendUmamiTrialStarted).not.toHaveBeenCalled();
  });
});
