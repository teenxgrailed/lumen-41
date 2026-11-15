import { AGE_CONFIRM_REDIRECT } from "@/lib/auth/age-confirmation";
import { getAuthOptions } from "@/lib/auth/auth-options";
import { isExistingOAuthUser } from "@/lib/auth/signups";
import { prisma } from "@/lib/prisma";

jest.mock("@auth/prisma-adapter", () => ({
  PrismaAdapter: jest.fn(() => ({})),
}));
jest.mock("@/lib/auth", () => ({
  getGoogleCredentials: jest.fn(),
  getOutlookCredentials: jest.fn(),
}));
jest.mock("@/lib/trials/trial-service", () => ({
  markEmailVerifiedAndStartTrial: jest.fn(),
}));
jest.mock("next/headers", () => ({
  cookies: jest.fn(async () => ({ get: () => undefined })),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    featureFlag: { findUnique: jest.fn() },
    account: { findUnique: jest.fn(), findFirst: jest.fn() },
    user: { findFirst: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
    systemSettings: { findFirst: jest.fn() },
  },
}));

const linkedAccount = jest.mocked(prisma.account.findUnique);
const userByEmail = jest.mocked(prisma.user.findFirst);
const usersByEmail = jest.mocked(prisma.user.findMany);
const env = process.env as Record<string, string | undefined>;

beforeEach(() => {
  jest.resetAllMocks();
  env.NEEDT_SIGNUPS_OPEN = "1";
  linkedAccount.mockResolvedValue(null);
  userByEmail.mockResolvedValue(null);
  usersByEmail.mockResolvedValue([]);
  jest.mocked(prisma.account.findFirst).mockResolvedValue(null);
});

afterAll(() => {
  delete env.NEEDT_SIGNUPS_OPEN;
});

describe("isExistingOAuthUser", () => {
  it("finds a returning Google user by the stored provider account", async () => {
    linkedAccount.mockResolvedValue({ id: "acc-1" } as never);
    await expect(
      isExistingOAuthUser({
        provider: "google",
        providerAccountId: "g-1",
        email: "a@gmail.com",
      })
    ).resolves.toBe(true);
    expect(linkedAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider_providerAccountId: {
            provider: "google",
            providerAccountId: "g-1",
          },
        },
      })
    );
    expect(userByEmail).not.toHaveBeenCalled();
  });

  it("falls back to the email, ignoring case and spaces", async () => {
    userByEmail.mockResolvedValue({ id: "u-1" } as never);
    await expect(
      isExistingOAuthUser({
        provider: "google",
        providerAccountId: "g-2",
        email: "  Person@Gmail.com ",
      })
    ).resolves.toBe(true);
    expect(userByEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: { equals: "Person@Gmail.com", mode: "insensitive" } },
      })
    );
  });

  it("is false for somebody new, with or without an email", async () => {
    await expect(
      isExistingOAuthUser({
        provider: "google",
        providerAccountId: "g-3",
        email: "new@gmail.com",
      })
    ).resolves.toBe(false);
    await expect(
      isExistingOAuthUser({ provider: "google", providerAccountId: "g-4" })
    ).resolves.toBe(false);
  });
});

describe("the signIn callback for Google with no age cookie at all", () => {
  async function signIn() {
    const options = await getAuthOptions();
    return options.callbacks!.signIn!({
      user: { id: "g-1", email: "a@gmail.com" },
      account: {
        provider: "google",
        type: "oauth",
        providerAccountId: "g-1",
      },
      profile: { email: "a@gmail.com", email_verified: true },
    } as never);
  }

  it("never blocks a returning user whose provider account is stored", async () => {
    linkedAccount.mockResolvedValue({ id: "acc-1" } as never);
    await expect(signIn()).resolves.toBe(true);
  });

  it("never blocks a returning user found by email", async () => {
    userByEmail.mockResolvedValue({ id: "u-1" } as never);
    usersByEmail.mockResolvedValue([
      { id: "u-1", email: "a@gmail.com", emailVerified: new Date() },
    ] as never);
    await expect(signIn()).resolves.toBe(true);
  });

  it("still sends a brand-new user without the cookie back to sign-up", async () => {
    await expect(signIn()).resolves.toBe(AGE_CONFIRM_REDIRECT);
  });
});
