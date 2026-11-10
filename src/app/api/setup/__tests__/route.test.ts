import { POST } from "@/app/api/setup/route";

import { prisma } from "@/lib/prisma";

jest.mock("bcryptjs", () => ({ hash: jest.fn().mockResolvedValue("hashed") }));
jest.mock("@/lib/setup-migration", () => ({
  migrateExistingData: jest.fn(),
}));
jest.mock("@/lib/system-settings-secrets", () => ({
  sealSystemSettingsSecrets: jest.fn(() => ({ resendApiKey: null })),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: { $transaction: jest.fn() },
}));

const transaction = prisma.$transaction as unknown as jest.Mock;

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/setup", {
      method: "POST",
      body: JSON.stringify(body),
    })
  );
}

const BODY = { name: "A", email: "a@example.com", password: "pw" };

describe("POST /api/setup", () => {
  beforeEach(() => jest.clearAllMocks());

  it("checks for existing users inside the locked transaction", async () => {
    const tx = {
      $executeRaw: jest.fn(),
      user: { count: jest.fn().mockResolvedValue(1), create: jest.fn() },
    };
    transaction.mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx));
    const res = await post(BODY);
    expect(res.status).toBe(400);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it("does not leak internal error detail to the caller", async () => {
    transaction.mockRejectedValue(
      new Error("connect ECONNREFUSED 10.0.0.5:5432")
    );
    const res = await post(BODY);
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("10.0.0.5");
  });
});
