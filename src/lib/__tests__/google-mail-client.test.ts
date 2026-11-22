const findFirst = jest.fn();
const warn = jest.fn();

jest.mock("@/lib/prisma", () => ({
  prisma: { systemSettings: { findFirst } },
}));
jest.mock("@/lib/logger", () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn, error: jest.fn() },
}));

const OAuth2 = jest.fn();
jest.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: function (...args: unknown[]) {
        OAuth2(...args);
        return { refreshAccessToken: jest.fn() };
      },
    },
  },
}));

describe("getGoogleMailCredentials", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    process.env = { ...originalEnv };
    delete process.env.DATABASE_URL;
    process.env.GOOGLE_CLIENT_ID = "main-id";
    process.env.GOOGLE_CLIENT_SECRET = "main-secret";
    delete process.env.GOOGLE_MAIL_CLIENT_ID;
    delete process.env.GOOGLE_MAIL_CLIENT_SECRET;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("uses the mail client when both variables are set", async () => {
    process.env.GOOGLE_MAIL_CLIENT_ID = "mail-id";
    process.env.GOOGLE_MAIL_CLIENT_SECRET = "mail-secret";
    const { getGoogleMailCredentials } = await import("@/lib/auth");
    await expect(getGoogleMailCredentials()).resolves.toEqual({
      clientId: "mail-id",
      clientSecret: "mail-secret",
      client: "mail",
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it("falls back to the main client and warns exactly once", async () => {
    const { getGoogleMailCredentials } = await import("@/lib/auth");
    const expected = {
      clientId: "main-id",
      clientSecret: "main-secret",
      client: "main",
    };
    await expect(getGoogleMailCredentials()).resolves.toEqual(expected);
    await expect(getGoogleMailCredentials()).resolves.toEqual(expected);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("does not use a half-set pair", async () => {
    process.env.GOOGLE_MAIL_CLIENT_ID = "mail-id";
    const { getGoogleMailCredentials } = await import("@/lib/auth");
    expect((await getGoogleMailCredentials()).client).toBe("main");
  });

  it("builds the OAuth client from the selected credentials", async () => {
    process.env.GOOGLE_MAIL_CLIENT_ID = "mail-id";
    process.env.GOOGLE_MAIL_CLIENT_SECRET = "mail-secret";
    const { createGoogleMailOAuthClient } = await import("@/lib/google");
    const result = await createGoogleMailOAuthClient({ redirectUrl: "r" });
    expect(result.client).toBe("mail");
    expect(OAuth2).toHaveBeenCalledWith("mail-id", "mail-secret", "r");
  });
});
