import {
  LINK_REFUSED_REDIRECT,
  accountLinkingGate,
  verifiedProviderEmail,
  withCaseInsensitiveEmailLookup,
} from "@/lib/auth/account-linking";
import { SIGN_IN_PROVIDER_IDS } from "@/lib/auth/sign-in-provider-ids";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    account: { findUnique: jest.fn() },
    user: { findMany: jest.fn(), findFirst: jest.fn() },
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const linked = jest.mocked(prisma.account.findUnique);
const owners = jest.mocked(prisma.user.findMany);

const OWNER = { id: "user-1", email: "Ann@Example.com" };

/** A raw profile in which the provider vouches for `email`. */
const VERIFIED: Record<string, Record<string, unknown>> = {
  google: { sub: "g", email: "ann@example.com", email_verified: true },
  apple: { sub: "a", email: "ann@example.com", email_verified: "true" },
  github: {
    id: 1,
    email: "ann@example.com",
    verified_primary_email: "ann@example.com",
  },
  "azure-ad": {
    sub: "m",
    email: "ann@example.com",
    tid: "corp",
    xms_edov: true,
  },
  openai: { sub: "o", email: "ann@example.com", email_verified: true },
  discord: { id: "d", email: "ann@example.com", verified: true },
  linkedin: { sub: "l", email: "ann@example.com", email_verified: true },
};

/** The same address, without the provider vouching for it. */
const UNVERIFIED: Record<string, Record<string, unknown>> = {
  google: { sub: "g", email: "ann@example.com", email_verified: false },
  apple: { sub: "a", email: "ann@example.com", email_verified: "false" },
  // public profile email only: no verified primary address
  github: { id: 1, email: "ann@example.com", verified_primary_email: null },
  // a work tenant that has not verified the domain
  "azure-ad": { sub: "m", email: "ann@example.com", tid: "other-tenant" },
  openai: { sub: "o", email: "ann@example.com" },
  discord: { id: "d", email: "ann@example.com", verified: false },
  linkedin: { sub: "l", email: "ann@example.com", email_verified: false },
  twitter: { email: "ann@example.com" },
};

beforeEach(() => {
  jest.clearAllMocks();
  linked.mockResolvedValue(null);
  owners.mockResolvedValue([]);
});

describe("verifiedProviderEmail", () => {
  it.each(Object.keys(VERIFIED))("%s: reads the verified address", (id) => {
    expect(verifiedProviderEmail(id, VERIFIED[id])).toBe("ann@example.com");
  });

  it.each(Object.keys(UNVERIFIED))(
    "%s: an unverified address is none",
    (id) => {
      expect(verifiedProviderEmail(id, UNVERIFIED[id])).toBeNull();
    }
  );

  it("Microsoft needs xms_edov for every tenant, personal accounts included", () => {
    expect(
      verifiedProviderEmail("azure-ad", {
        email: "ann@outlook.com",
        tid: "9188040d-6c67-4c5b-b112-36a304b66dad",
      })
    ).toBeNull();
    expect(
      verifiedProviderEmail("azure-ad", {
        email: "ann@outlook.com",
        tid: "9188040d-6c67-4c5b-b112-36a304b66dad",
        xms_edov: true,
      })
    ).toBe("ann@outlook.com");
    expect(
      verifiedProviderEmail("azure-ad", {
        email: "ann@corp.com",
        tid: "corp",
        xms_edov: false,
      })
    ).toBeNull();
  });

  it("X never vouches for an email", () => {
    expect(
      verifiedProviderEmail("twitter", {
        email: "ann@example.com",
        email_verified: true,
        verified: true,
      })
    ).toBeNull();
  });
});

describe("accountLinkingGate", () => {
  it("lets an identity that is already linked in", async () => {
    linked.mockResolvedValue({ id: "acc-1" } as never);
    await expect(
      accountLinkingGate({
        provider: "twitter",
        providerAccountId: "x-1",
        profile: {},
      })
    ).resolves.toBe(true);
    expect(owners).not.toHaveBeenCalled();
  });

  it("lets a sign-in through when no account has the email (a new account)", async () => {
    await expect(
      accountLinkingGate({
        provider: "discord",
        providerAccountId: "d-1",
        profile: UNVERIFIED.discord,
      })
    ).resolves.toBe(true);
  });

  it.each(Object.keys(VERIFIED))(
    "%s: joins the existing account on a verified matching email",
    async (id) => {
      owners.mockResolvedValue([OWNER] as never);
      await expect(
        accountLinkingGate({
          provider: id,
          providerAccountId: `${id}-1`,
          profile: VERIFIED[id],
        })
      ).resolves.toBe(true);
      // the lookup ignores case, as the adapter's does
      expect(owners).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [{ email: { equals: "ann@example.com", mode: "insensitive" } }],
          },
        })
      );
    }
  );

  it.each(Object.keys(UNVERIFIED))(
    "%s: refuses to join on an unverified email",
    async (id) => {
      owners.mockResolvedValue([OWNER] as never);
      await expect(
        accountLinkingGate({
          provider: id,
          providerAccountId: `${id}-1`,
          profile: UNVERIFIED[id],
        })
      ).resolves.toBe(LINK_REFUSED_REDIRECT);
    }
  );

  it("refuses when the verified email belongs to someone else than the match", async () => {
    owners.mockResolvedValue([
      { id: "user-2", email: "bob@example.com" },
    ] as never);
    await expect(
      accountLinkingGate({
        provider: "github",
        providerAccountId: "gh-1",
        profile: {
          email: "bob@example.com",
          verified_primary_email: "ann@example.com",
        },
      })
    ).resolves.toBe(LINK_REFUSED_REDIRECT);
  });

  it("X never joins an existing account, even with a matching email", async () => {
    owners.mockResolvedValue([OWNER] as never);
    await expect(
      accountLinkingGate({
        provider: "twitter",
        providerAccountId: "x-1",
        profile: { email: "ann@example.com", email_verified: true },
      })
    ).resolves.toBe(LINK_REFUSED_REDIRECT);
  });

  it("X without an email is always a new account", async () => {
    await expect(
      accountLinkingGate({
        provider: "twitter",
        providerAccountId: "x-2",
        profile: { data: { id: "x-2" } },
      })
    ).resolves.toBe(true);
    expect(owners).not.toHaveBeenCalled();
  });

  it("never touches a credentials sign-in", async () => {
    await expect(
      accountLinkingGate({ provider: "credentials", profile: {} })
    ).resolves.toBe(true);
    expect(linked).not.toHaveBeenCalled();
  });

  it("refuses on a database error rather than guessing", async () => {
    linked.mockRejectedValue(new Error("db down"));
    await expect(
      accountLinkingGate({
        provider: "google",
        providerAccountId: "g-1",
        profile: VERIFIED.google,
      })
    ).resolves.toBe("/auth/signin?error=OAuthCallback");
  });

  it("covers every sign-in provider", () => {
    for (const id of SIGN_IN_PROVIDER_IDS)
      expect(Object.keys(UNVERIFIED)).toContain(id);
  });
});

describe("withCaseInsensitiveEmailLookup", () => {
  it("finds the account whatever the case of the provider's address", async () => {
    jest.mocked(prisma.user.findFirst).mockResolvedValue(OWNER as never);
    const adapter = withCaseInsensitiveEmailLookup({
      getUserByEmail: jest.fn(),
    } as never);
    await expect(adapter.getUserByEmail!("ANN@example.com")).resolves.toBe(
      OWNER
    );
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { email: { equals: "ANN@example.com", mode: "insensitive" } },
    });
  });
});
