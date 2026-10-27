import { getAuthOptions } from "@/lib/auth/auth-options";
import { prisma } from "@/lib/prisma";
import { markEmailVerifiedAndStartTrial } from "@/lib/trials/trial-service";

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
      typeof options.callbacks
    >["jwt"];
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
});
