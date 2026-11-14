import { getAuthOptions } from "@/lib/auth/auth-options";
import { prisma } from "@/lib/prisma";
import { markEmailVerifiedAndStartTrial } from "@/lib/trials/trial-service";
import { sendUmamiSignupCompleted } from "@/lib/umami-server";

jest.mock("@auth/prisma-adapter", () => ({
  PrismaAdapter: jest.fn(() => ({})),
}));
jest.mock("@/lib/auth", () => ({
  getGoogleCredentials: jest
    .fn()
    .mockResolvedValue({ clientId: "google-id", clientSecret: "secret" }),
  getOutlookCredentials: jest.fn().mockResolvedValue({
    clientId: "outlook-id",
    clientSecret: "secret",
    tenantId: "common",
  }),
}));
jest.mock("@/lib/prisma", () => ({
  prisma: {
    autoScheduleSettings: { upsert: jest.fn() },
    userSettings: { upsert: jest.fn() },
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ isActive: true, sessionVersion: 0 }),
      updateMany: jest.fn(),
    },
    systemSettings: { findFirst: jest.fn().mockResolvedValue(null) },
  },
}));
jest.mock("@/lib/umami-server", () => ({
  sendUmamiSignupCompleted: jest.fn(),
}));
jest.mock("@/lib/attribution-server", () => ({
  requestUtm: jest.fn().mockResolvedValue({ utm_source: "newsletter" }),
}));
jest.mock("@/lib/trials/trial-service", () => ({
  markEmailVerifiedAndStartTrial: jest.fn(),
}));

describe("a brand-new OAuth account", () => {
  it("is sent to the onboarding resolver; NextAuth uses this only for a new user", async () => {
    const options = await getAuthOptions();
    // The resolver picks /start or /setup per user (onboarding_v3).
    expect(options.pages?.newUser).toBe("/api/onboarding/resume");
  });
});

describe("OAuth trial activation", () => {
  it("uses the adapter-backed user id and starts Pro on first OAuth login", async () => {
    jest.mocked(markEmailVerifiedAndStartTrial).mockResolvedValue({} as never);
    jest.mocked(prisma.userSettings.upsert).mockResolvedValue({} as never);
    const options = await getAuthOptions();
    const jwt = options.callbacks?.jwt;
    expect(jwt).toBeDefined();

    const token = await (jwt as NonNullable<typeof jwt>)({
      token: {},
      user: {
        id: "db-user-1",
        email: "oauth@example.com",
        role: "user",
      },
      account: {
        provider: "google",
        type: "oauth",
        providerAccountId: "google-1",
      },
      profile: { email: "oauth@example.com", email_verified: true },
      isNewUser: true,
      trigger: "signIn",
    } as never);

    expect(token.sub).toBe("db-user-1");
    // The re-authentication stamp goes by id, so an email-less account gets it.
    expect(prisma.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "db-user-1" } })
    );
    expect(markEmailVerifiedAndStartTrial).toHaveBeenCalledWith({
      userId: "db-user-1",
      email: "oauth@example.com",
    });
  });

  it("leaves the email unconfirmed when the provider does not vouch for it", async () => {
    jest.mocked(markEmailVerifiedAndStartTrial).mockClear();
    jest.mocked(prisma.userSettings.upsert).mockResolvedValue({} as never);
    const options = await getAuthOptions();
    const jwt = options.callbacks?.jwt as NonNullable<
      NonNullable<typeof options.callbacks>["jwt"]
    >;
    const account = {
      provider: "google",
      type: "oauth",
      providerAccountId: "google-2",
    };
    const user = { id: "db-user-2", email: "oauth@example.com", role: "user" };
    const unverified = { email: "oauth@example.com", email_verified: false };
    const otherAddress = { email: "else@example.com", email_verified: true };
    for (const profile of [unverified, otherAddress, undefined]) {
      await jwt({
        token: {},
        user,
        account,
        profile,
        isNewUser: true,
        trigger: "signIn",
      } as never);
    }
    expect(markEmailVerifiedAndStartTrial).not.toHaveBeenCalled();
  });

  it("reports signup_completed for a new account only, with the utm tags", async () => {
    jest.mocked(sendUmamiSignupCompleted).mockClear();
    jest.mocked(prisma.userSettings.upsert).mockResolvedValue({} as never);
    const options = await getAuthOptions();
    const jwt = options.callbacks?.jwt as NonNullable<
      NonNullable<typeof options.callbacks>["jwt"]
    >;
    const base = {
      token: {},
      user: { id: "db-user-3", email: "o@example.com", role: "user" },
      account: {
        provider: "google",
        type: "oauth",
        providerAccountId: "google-3",
      },
      profile: undefined,
      trigger: "signIn",
    };
    await jwt({ ...base, isNewUser: false } as never);
    expect(sendUmamiSignupCompleted).not.toHaveBeenCalled();
    await jwt({ ...base, isNewUser: true } as never);
    expect(sendUmamiSignupCompleted).toHaveBeenCalledTimes(1);
    expect(sendUmamiSignupCompleted).toHaveBeenCalledWith("google", {
      utm_source: "newsletter",
    });
  });

  it("Google One Tap fires signup_completed and the trial like the Google button", async () => {
    jest.mocked(sendUmamiSignupCompleted).mockClear();
    jest.mocked(markEmailVerifiedAndStartTrial).mockClear();
    jest.mocked(prisma.userSettings.upsert).mockResolvedValue({} as never);
    const options = await getAuthOptions();
    const jwt = options.callbacks?.jwt as NonNullable<
      NonNullable<typeof options.callbacks>["jwt"]
    >;
    const call = (oneTapNew: boolean) =>
      jwt({
        token: {},
        user: {
          id: "db-user-4",
          email: "tap@example.com",
          role: "user",
          oneTapNew,
          oneTapEmail: "tap@example.com",
          oneTapAuthAt: Date.UTC(2026, 10, 14, 10, 0, 0),
        },
        account: {
          provider: "google-onetap",
          type: "credentials",
          providerAccountId: "db-user-4",
        },
        trigger: "signIn",
      } as never);
    const returning = await call(false);
    /* The re-authentication stamp is when Google issued the token. */
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: "db-user-4" },
      data: { lastAuthenticatedAt: new Date(Date.UTC(2026, 10, 14, 10, 0, 0)) },
    });
    expect(returning.freshAccountAt).toBeUndefined();
    expect(sendUmamiSignupCompleted).not.toHaveBeenCalled();
    expect(returning.provider).toBe("google");
    await call(true);
    expect(sendUmamiSignupCompleted).toHaveBeenCalledWith("google", {
      utm_source: "newsletter",
    });
    expect(markEmailVerifiedAndStartTrial).toHaveBeenCalledWith({
      userId: "db-user-4",
      email: "tap@example.com",
    });
  });

  it("registers the One Tap provider only when Google is configured", async () => {
    const has = async () =>
      (await getAuthOptions()).providers.some(
        /* NextAuth keeps a credentials provider's custom id under `options`. */
        (p) =>
          (p as { options?: { id?: string } }).options?.id === "google-onetap"
      );
    expect(await has()).toBe(false);
    process.env.GOOGLE_CLIENT_ID = "id.apps.googleusercontent.com";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    try {
      expect(await has()).toBe(true);
    } finally {
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
    }
  });
});
