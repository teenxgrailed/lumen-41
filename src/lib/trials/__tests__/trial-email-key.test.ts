import { Prisma } from "@prisma/client";

import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";
import {
  hashLegacyTrialEmailKeys,
  startTrialForVerifiedUser,
  trialEmailKey,
} from "@/lib/trials/trial-service";

jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    trialGrant: { findMany: jest.fn(), update: jest.fn() },
  },
}));

const trialGrant = prisma.trialGrant as unknown as {
  findMany: jest.Mock;
  update: jest.Mock;
};

function transaction() {
  return {
    subscription: { upsert: jest.fn().mockResolvedValue({}) },
    trialGrant: {
      findFirst: jest.fn().mockResolvedValue(null),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn(),
    },
  };
}

describe("trial email key", () => {
  const previous = process.env.RATE_LIMIT_HASH_SECRET;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.RATE_LIMIT_HASH_SECRET = "trial-test-secret";
  });

  afterAll(() => {
    if (previous === undefined) delete process.env.RATE_LIMIT_HASH_SECRET;
    else process.env.RATE_LIMIT_HASH_SECRET = previous;
  });

  it("is a keyed hash that holds no part of the address", () => {
    const key = trialEmailKey("Person@Example.com");

    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).not.toContain("person");
    expect(key).not.toContain("example");
  });

  it("gives every spelling of one mailbox the same key", () => {
    expect(trialEmailKey("first.last+promo@googlemail.com")).toBe(
      trialEmailKey(" FirstLast@gmail.com ")
    );
    expect(trialEmailKey("a@example.com")).not.toBe(
      trialEmailKey("b@example.com")
    );
  });

  it("depends on the server secret", () => {
    const first = trialEmailKey("person@example.com");
    process.env.RATE_LIMIT_HASH_SECRET = "another-secret";

    expect(trialEmailKey("person@example.com")).not.toBe(first);
  });

  it("refuses to run without the server secret", () => {
    delete process.env.RATE_LIMIT_HASH_SECRET;

    expect(() => trialEmailKey("person@example.com")).toThrow(
      "RATE_LIMIT_HASH_SECRET is required."
    );
  });

  it("writes the hashed key, never the address", async () => {
    const tx = transaction();
    const key = trialEmailKey("person@example.com");
    tx.trialGrant.findUnique.mockResolvedValue({ id: "g1", userId: "u1" });

    await expect(
      startTrialForVerifiedUser(tx as never, {
        userId: "u1",
        email: "Person@Example.com",
        now: newDate("2026-10-11T00:00:00.000Z"),
      })
    ).resolves.toEqual({ id: "g1", userId: "u1" });

    expect(tx.trialGrant.createMany.mock.calls[0][0].data.emailKey).toBe(key);
    expect(JSON.stringify(tx.trialGrant.createMany.mock.calls)).not.toContain(
      "person@example.com"
    );
  });

  it("still spends the trial for an address granted before hashing", async () => {
    const tx = transaction();
    tx.trialGrant.findFirst.mockResolvedValue({ id: "old", userId: "u-old" });

    await expect(
      startTrialForVerifiedUser(tx as never, {
        userId: "u-new",
        email: "person@example.com",
      })
    ).resolves.toBeNull();

    expect(tx.trialGrant.findFirst).toHaveBeenCalledWith({
      where: {
        emailKey: {
          in: [trialEmailKey("person@example.com"), "person@example.com"],
        },
      },
    });
    expect(tx.trialGrant.createMany).not.toHaveBeenCalled();
  });

  it("rewrites plaintext keys to hashes and clears a collision", async () => {
    trialGrant.findMany.mockResolvedValueOnce([
      { id: "g1", emailKey: "person@example.com" },
      { id: "g2", emailKey: "dup@example.com" },
    ]);
    trialGrant.update
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("unique", {
          code: "P2002",
          clientVersion: "test",
        })
      )
      .mockResolvedValueOnce({});

    await expect(hashLegacyTrialEmailKeys()).resolves.toBe(2);

    expect(trialGrant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { emailKey: { contains: "@" } } })
    );
    expect(trialGrant.update.mock.calls.map(([call]) => call)).toEqual([
      {
        where: { id: "g1" },
        data: { emailKey: trialEmailKey("person@example.com") },
      },
      {
        where: { id: "g2" },
        data: { emailKey: trialEmailKey("dup@example.com") },
      },
      { where: { id: "g2" }, data: { emailKey: "superseded:g2" } },
    ]);
  });
});
