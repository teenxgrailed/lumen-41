import { createSign, generateKeyPairSync } from "node:crypto";

import { accountLinkingGate } from "@/lib/auth/account-linking";
import { hasAgeConfirmation } from "@/lib/auth/age-confirmation";
import {
  OneTapError,
  signInWithGoogleCredential,
} from "@/lib/auth/google-one-tap";
import { isPublicSignupEnabled } from "@/lib/auth/public-signup";
import { readSignInProviderConfig } from "@/lib/auth/sign-in-providers";
import { areSignupsOpen } from "@/lib/auth/signups";
import { prisma } from "@/lib/prisma";

jest.mock("@/lib/auth/account-linking", () => ({
  accountLinkingGate: jest.fn(),
}));
jest.mock("@/lib/auth/age-confirmation", () => ({
  hasAgeConfirmation: jest.fn(),
}));
jest.mock("@/lib/auth/public-signup", () => ({
  isPublicSignupEnabled: jest.fn(),
}));
jest.mock("@/lib/auth/sign-in-providers", () => ({
  readSignInProviderConfig: jest.fn(),
}));
jest.mock("@/lib/auth/signups", () => ({ areSignupsOpen: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    account: { findUnique: jest.fn(), create: jest.fn() },
    user: { findFirst: jest.fn(), create: jest.fn() },
  },
}));

const CLIENT_ID = "123-abc.apps.googleusercontent.com";
const NOW_MS = Date.UTC(2026, 10, 14, 12, 0, 0);
const NOW_S = Math.floor(NOW_MS / 1000);
const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const keys = async () => [
  { ...pair.publicKey.export({ format: "jwk" }), kid: "k" },
];
const b64 = (v: unknown) =>
  Buffer.from(JSON.stringify(v)).toString("base64url");

function credential(claims: Record<string, unknown> = {}) {
  const header = b64({ alg: "RS256", kid: "k" });
  const payload = b64({
    iss: "https://accounts.google.com",
    aud: CLIENT_ID,
    sub: "g-1",
    email: "new@example.com",
    email_verified: true,
    iat: NOW_S - 5,
    exp: NOW_S + 600,
    ...claims,
  });
  const sig = createSign("RSA-SHA256")
    .update(`${header}.${payload}`)
    .sign(pair.privateKey)
    .toString("base64url");
  return `${header}.${payload}.${sig}`;
}

const run = (token: string) =>
  signInWithGoogleCredential(token, { keys, nowMs: NOW_MS });

const dbUser = {
  id: "u1",
  email: "new@example.com",
  name: null,
  image: null,
  role: "user",
  isActive: true,
  sandboxKind: null,
};

beforeEach(() => {
  jest.resetAllMocks();
  jest.mocked(readSignInProviderConfig).mockResolvedValue({
    google: { clientId: CLIENT_ID, clientSecret: "s" },
  } as never);
  jest.mocked(accountLinkingGate).mockResolvedValue(true);
  jest.mocked(areSignupsOpen).mockResolvedValue(true);
  jest.mocked(isPublicSignupEnabled).mockResolvedValue(true);
  jest.mocked(hasAgeConfirmation).mockResolvedValue(true);
  jest.mocked(prisma.account.findUnique).mockResolvedValue(null);
  jest.mocked(prisma.user.findFirst).mockResolvedValue(null);
  jest.mocked(prisma.user.create).mockResolvedValue(dbUser as never);
});

describe("signInWithGoogleCredential", () => {
  it("creates the account on a first sign-in and flags it new", async () => {
    const user = await run(credential());
    expect(user).toMatchObject({
      id: "u1",
      oneTapNew: true,
      oneTapEmail: "new@example.com",
    });
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "new@example.com",
          accounts: {
            create: {
              type: "oauth",
              provider: "google",
              providerAccountId: "g-1",
            },
          },
        }),
      })
    );
  });

  it("refuses a new account while sign-ups are closed", async () => {
    jest.mocked(areSignupsOpen).mockResolvedValue(false);
    await expect(run(credential())).rejects.toMatchObject({
      code: "SignupsClosed",
    });
    jest.mocked(areSignupsOpen).mockResolvedValue(true);
    jest.mocked(isPublicSignupEnabled).mockResolvedValue(false);
    await expect(run(credential())).rejects.toMatchObject({
      code: "SignupsClosed",
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("asks for the 16+ confirmation before creating an account", async () => {
    jest.mocked(hasAgeConfirmation).mockResolvedValue(false);
    await expect(run(credential())).rejects.toMatchObject({
      code: "AgeConfirmRequired",
    });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("signs a linked Google account in even when sign-ups are closed", async () => {
    jest.mocked(areSignupsOpen).mockResolvedValue(false);
    jest.mocked(hasAgeConfirmation).mockResolvedValue(false);
    jest
      .mocked(prisma.account.findUnique)
      .mockResolvedValue({ user: dbUser } as never);
    const user = await run(credential());
    expect(user).toMatchObject({ id: "u1", oneTapNew: false });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("joins an existing account by the verified email", async () => {
    jest.mocked(prisma.user.findFirst).mockResolvedValue(dbUser as never);
    const user = await run(credential());
    expect(user.oneTapNew).toBe(false);
    expect(prisma.account.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "u1", providerAccountId: "g-1" }),
    });
  });

  it("follows the linking gate's refusal", async () => {
    jest
      .mocked(accountLinkingGate)
      .mockResolvedValue("/auth/signin?error=OAuthAccountNotLinked");
    await expect(run(credential())).rejects.toMatchObject({
      code: "OAuthAccountNotLinked",
    });
  });

  it("never signs a sandbox or deactivated account in, and links nothing", async () => {
    jest
      .mocked(prisma.user.findFirst)
      .mockResolvedValue({ ...dbUser, sandboxKind: "REVIEWER" } as never);
    await expect(run(credential())).rejects.toMatchObject({
      code: "AccessDenied",
    });
    jest
      .mocked(prisma.user.findFirst)
      .mockResolvedValue({ ...dbUser, isActive: false } as never);
    await expect(run(credential())).rejects.toMatchObject({
      code: "AccessDenied",
    });
    expect(prisma.account.create).not.toHaveBeenCalled();
  });

  it.each([
    ["a wrong audience", { aud: "other" }],
    ["an expired token", { exp: NOW_S - 3600 }],
    ["an unverified email", { email_verified: false }],
  ])("refuses %s as a plain failed sign-in", async (_n, claims) => {
    const failure = run(credential(claims));
    await expect(failure).rejects.toBeInstanceOf(OneTapError);
    await expect(failure).rejects.toMatchObject({ code: "CredentialsSignin" });
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("refuses everything when Google is not configured", async () => {
    jest.mocked(readSignInProviderConfig).mockResolvedValue({
      google: { clientId: "", clientSecret: "" },
    } as never);
    await expect(run(credential())).rejects.toMatchObject({
      code: "CredentialsSignin",
    });
  });
});
