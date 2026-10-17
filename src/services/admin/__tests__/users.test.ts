import { prisma } from "@/lib/prisma";

import { getAdminUserDetail, searchAdminUsers } from "../users";

jest.mock("@/lib/prisma", () => ({
  prisma: { user: { findMany: jest.fn(), findUnique: jest.fn() } },
}));

const db = prisma as unknown as {
  user: { findMany: jest.Mock; findUnique: jest.Mock };
};

beforeEach(() => jest.clearAllMocks());

describe("searchAdminUsers", () => {
  it("matches part of an email, any case, as a bound value", async () => {
    db.user.findMany.mockResolvedValue([]);
    await searchAdminUsers('  Pat@Exa\'; DROP TABLE "User"; -- ');
    const args = db.user.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      email: {
        contains: 'Pat@Exa\'; DROP TABLE "User"; --',
        mode: "insensitive",
      },
    });
    expect(args.take).toBe(25);
  });

  it("lists the newest accounts for an empty search and gives each a plan", async () => {
    db.user.findMany.mockResolvedValue([
      {
        id: "u1",
        email: "a@x.com",
        name: null,
        role: "user",
        createdAt: new Date("2026-10-01T00:00:00Z"),
        subscription: null,
        trialGrant: null,
      },
    ]);
    const rows = await searchAdminUsers("");
    expect(db.user.findMany.mock.calls[0][0].where).toBeUndefined();
    expect(rows).toEqual([
      expect.objectContaining({ id: "u1", plan: "FREE", role: "user" }),
    ]);
  });
});

describe("getAdminUserDetail", () => {
  it("shows provider names and never selects a token", async () => {
    db.user.findUnique.mockResolvedValue({
      id: "u1",
      email: "a@x.com",
      name: null,
      role: "admin",
      isActive: true,
      createdAt: null,
      lastAuthenticatedAt: new Date("2026-10-15T08:00:00Z"),
      subscription: null,
      trialGrant: { endsAt: new Date("2099-01-01T00:00:00Z") },
      accounts: [{ provider: "google" }, { provider: "google" }],
      connectedAccounts: [{ provider: "OUTLOOK" }],
      mailAccounts: [{ provider: "GMAIL" }],
      deletionRequest: null,
    });
    const detail = await getAdminUserDetail("u1");
    expect(detail).toMatchObject({
      plan: "PRO",
      trialEndsAt: "2099-01-01T00:00:00.000Z",
      lastSignInAt: "2026-10-15T08:00:00.000Z",
      providers: { signIn: ["google"], calendar: ["outlook"], mail: ["gmail"] },
    });
    const select = JSON.stringify(db.user.findUnique.mock.calls[0][0].select);
    expect(select).not.toMatch(/token|secret|password|credentials/i);
  });

  it("returns null for an unknown account", async () => {
    db.user.findUnique.mockResolvedValue(null);
    await expect(getAdminUserDetail("nope")).resolves.toBeNull();
  });
});
