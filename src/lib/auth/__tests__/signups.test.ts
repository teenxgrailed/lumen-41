import { getGoogleCredentials, getOutlookCredentials } from "@/lib/auth";
import { getAuthOptions } from "@/lib/auth/auth-options";
import {
  SIGNUPS_CLOSED_REDIRECT,
  areSignupsOpen,
  oauthSignInGate,
} from "@/lib/auth/signups";
import { isFeatureEnabledForEveryone } from "@/lib/feature-flags";
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
jest.mock("@/lib/prisma", () => ({
  prisma: {
    featureFlag: { findUnique: jest.fn() },
    account: { findUnique: jest.fn() },
    user: { findUnique: jest.fn(), updateMany: jest.fn() },
  },
}));

const flagRow = jest.mocked(prisma.featureFlag.findUnique);
const linkedAccount = jest.mocked(prisma.account.findUnique);
const userByEmail = jest.mocked(prisma.user.findUnique);

function setFlag(row: { enabled: boolean; rolloutPercentage: number } | null) {
  flagRow.mockResolvedValue(row as never);
}

const env = process.env as Record<string, string | undefined>;
const originalEnv = {
  NODE_ENV: env.NODE_ENV,
  CI: env.CI,
  NEEDT_SIGNUPS_OPEN: env.NEEDT_SIGNUPS_OPEN,
};

beforeEach(() => {
  jest.resetAllMocks();
  delete env.NEEDT_SIGNUPS_OPEN;
  delete env.CI;
  jest
    .mocked(getGoogleCredentials)
    .mockResolvedValue({ clientId: "google-id", clientSecret: "secret" });
  jest.mocked(getOutlookCredentials).mockResolvedValue({} as never);
  linkedAccount.mockResolvedValue(null);
  userByEmail.mockResolvedValue(null);
});

afterAll(() => {
  Object.assign(env, originalEnv);
});

describe("isFeatureEnabledForEveryone", () => {
  it("is on only when enabled for the whole rollout", async () => {
    setFlag(null);
    await expect(isFeatureEnabledForEveryone("signups_open")).resolves.toBe(
      false
    );
    setFlag({ enabled: false, rolloutPercentage: 100 });
    await expect(isFeatureEnabledForEveryone("signups_open")).resolves.toBe(
      false
    );
    setFlag({ enabled: true, rolloutPercentage: 50 });
    await expect(isFeatureEnabledForEveryone("signups_open")).resolves.toBe(
      false
    );
    setFlag({ enabled: true, rolloutPercentage: 100 });
    await expect(isFeatureEnabledForEveryone("signups_open")).resolves.toBe(
      true
    );
  });
});

describe("areSignupsOpen", () => {
  it("is closed without a flag row and open when the row is on", async () => {
    setFlag(null);
    await expect(areSignupsOpen()).resolves.toBe(false);
    setFlag({ enabled: true, rolloutPercentage: 100 });
    await expect(areSignupsOpen()).resolves.toBe(true);
  });

  it("reads a database error as closed", async () => {
    flagRow.mockRejectedValue(new Error("db down"));
    await expect(areSignupsOpen()).resolves.toBe(false);
  });

  it("honours NEEDT_SIGNUPS_OPEN outside production and under CI only", async () => {
    setFlag(null);
    env.NEEDT_SIGNUPS_OPEN = "1";

    env.NODE_ENV = "test";
    await expect(areSignupsOpen()).resolves.toBe(true);

    env.NODE_ENV = "production";
    await expect(areSignupsOpen()).resolves.toBe(false);

    env.CI = "true";
    await expect(areSignupsOpen()).resolves.toBe(true);
    env.NODE_ENV = originalEnv.NODE_ENV;
  });
});

describe("oauthSignInGate", () => {
  it("never stops a credentials sign-in", async () => {
    setFlag(null);
    await expect(
      oauthSignInGate({ provider: "credentials", email: "a@example.com" })
    ).resolves.toBe(true);
    expect(flagRow).not.toHaveBeenCalled();
  });

  it("lets an existing OAuth user in while sign-up is closed", async () => {
    setFlag(null);
    linkedAccount.mockResolvedValue({ id: "acc-1" } as never);
    await expect(
      oauthSignInGate({
        provider: "google",
        providerAccountId: "g-1",
        email: "old@example.com",
      })
    ).resolves.toBe(true);
  });

  it("lets a known email through so NextAuth can link or refuse it", async () => {
    setFlag(null);
    userByEmail.mockResolvedValue({ id: "user-1" } as never);
    await expect(
      oauthSignInGate({
        provider: "google",
        providerAccountId: "g-2",
        email: "Old@Example.com",
      })
    ).resolves.toBe(true);
    expect(userByEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: "Old@Example.com" },
      })
    );
  });

  it("sends a new OAuth user back to sign-in while sign-up is closed", async () => {
    setFlag(null);
    await expect(
      oauthSignInGate({
        provider: "azure-ad",
        providerAccountId: "ms-1",
        email: "new@example.com",
      })
    ).resolves.toBe(SIGNUPS_CLOSED_REDIRECT);
  });

  it("lets a new OAuth user in once sign-up is open", async () => {
    setFlag({ enabled: true, rolloutPercentage: 100 });
    await expect(
      oauthSignInGate({
        provider: "google",
        providerAccountId: "g-3",
        email: "new@example.com",
      })
    ).resolves.toBe(true);
    expect(linkedAccount).not.toHaveBeenCalled();
  });
});

describe("NextAuth signIn callback", () => {
  async function signInCallback() {
    const options = await getAuthOptions();
    return options.callbacks!.signIn!;
  }

  it("redirects a would-be new OAuth user to the closed notice", async () => {
    setFlag(null);
    const signIn = await signInCallback();
    await expect(
      signIn({
        user: { id: "profile-1", email: "new@example.com" },
        account: {
          provider: "google",
          type: "oauth",
          providerAccountId: "g-new",
        },
      } as never)
    ).resolves.toBe("/auth/signin?error=SignupsClosed");
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it("signs an existing OAuth user in", async () => {
    setFlag(null);
    linkedAccount.mockResolvedValue({ id: "acc-1" } as never);
    const signIn = await signInCallback();
    await expect(
      signIn({
        user: { id: "user-1", email: "old@example.com" },
        account: {
          provider: "google",
          type: "oauth",
          providerAccountId: "g-old",
        },
      } as never)
    ).resolves.toBe(true);
    expect(prisma.user.updateMany).toHaveBeenCalled();
  });
});
