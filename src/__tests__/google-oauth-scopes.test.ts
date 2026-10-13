import { getAuthOptions } from "@/lib/auth/auth-options";

jest.mock("@auth/prisma-adapter", () => ({
  PrismaAdapter: jest.fn(() => ({})),
}));
jest.mock("next-auth/providers/google", () => {
  return jest.fn((opts: unknown) => ({ __mockGoogleOpts: opts }));
});

// Sign-in reads its credentials from System Settings, then the environment
// (sign-in-providers.ts): no settings row here, so the environment.
jest.mock("@/lib/prisma", () => ({
  prisma: { systemSettings: { findFirst: jest.fn().mockResolvedValue(null) } },
}));

describe("Google OAuth scopes in Auth Options", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("keeps sign-in on non-sensitive identity scopes", async () => {
    process.env.GOOGLE_CLIENT_ID = "id";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    const options = await getAuthOptions();

    // Find our mocked provider object
    const provider = (
      options.providers as unknown as Array<Record<string, unknown>>
    ).find(
      (candidate) =>
        candidate &&
        Object.prototype.hasOwnProperty.call(candidate, "__mockGoogleOpts")
    );
    expect(provider).toBeDefined();

    const providerObj = provider as unknown as {
      __mockGoogleOpts: { authorization: { params: { scope: string } } };
    };
    const scope = providerObj.__mockGoogleOpts.authorization.params.scope;
    expect(scope.split(/\s+/)).toEqual(["openid", "email", "profile"]);
    expect(scope).not.toContain("/auth/calendar");
    expect(scope).not.toContain("/auth/tasks");
  });
});
