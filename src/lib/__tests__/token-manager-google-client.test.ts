import {
  createGoogleMailOAuthClient,
  createGoogleOAuthClient,
} from "@/lib/google";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/security/secret-encryption";
import { TokenManager } from "@/lib/token-manager";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    connectedAccount: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
  },
}));
jest.mock("@/lib/auth", () => ({ getOutlookCredentials: jest.fn() }));
jest.mock("@/lib/google", () => ({
  createGoogleOAuthClient: jest.fn(),
  createGoogleMailOAuthClient: jest.fn(),
}));
jest.mock("@/lib/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockPrisma = prisma as unknown as {
  connectedAccount: Record<
    "findUnique" | "findFirst" | "update" | "create",
    jest.Mock
  >;
};

function client(token: string) {
  return {
    setCredentials: jest.fn(),
    refreshAccessToken: jest.fn(async () => ({
      credentials: { access_token: token, expiry_date: 4_000_000_000_000 },
    })),
  };
}

function row(oauthClient: string | null) {
  return {
    id: "acc-1",
    accessToken: encryptSecret("old"),
    refreshToken: encryptSecret("refresh"),
    expiresAt: new Date("2000-01-01T00:00:00.000Z"),
    oauthClient,
  };
}

describe("refreshing Google tokens uses the client that issued them", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.connectedAccount.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: "acc-1",
        ...data,
      })
    );
  });

  it("uses the main client for a null (legacy) grant", async () => {
    (createGoogleOAuthClient as jest.Mock).mockResolvedValue(
      client("from-main")
    );
    mockPrisma.connectedAccount.findUnique.mockResolvedValue(row(null));
    const out = await TokenManager.getInstance().refreshGoogleTokens(
      "acc-1",
      "u1"
    );
    expect(out?.accessToken).toBe("from-main");
    expect(createGoogleMailOAuthClient).not.toHaveBeenCalled();
  });

  it("uses the mail client for a mail grant", async () => {
    (createGoogleMailOAuthClient as jest.Mock).mockResolvedValue({
      client: "mail",
      oauth2Client: client("from-mail"),
    });
    mockPrisma.connectedAccount.findUnique.mockResolvedValue(row("mail"));
    const out = await TokenManager.getInstance().refreshGoogleTokens(
      "acc-1",
      "u1"
    );
    expect(out?.accessToken).toBe("from-mail");
    expect(createGoogleOAuthClient).not.toHaveBeenCalled();
  });

  it("does not refresh a mail grant with the main client when the mail env is gone", async () => {
    (createGoogleMailOAuthClient as jest.Mock).mockResolvedValue({
      client: "main",
      oauth2Client: client("wrong"),
    });
    mockPrisma.connectedAccount.findUnique.mockResolvedValue(row("mail"));
    await expect(
      TokenManager.getInstance().refreshGoogleTokens("acc-1", "u1")
    ).resolves.toBeNull();
  });
});

describe("getValidAccessToken accepts a mail grant", () => {
  it("refreshes a GOOGLE_MAIL row with the client that issued it", async () => {
    jest.clearAllMocks();
    mockPrisma.connectedAccount.update.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => ({
        id: "acc-1",
        ...data,
      })
    );
    (createGoogleMailOAuthClient as jest.Mock).mockResolvedValue({
      client: "mail",
      oauth2Client: client("from-mail"),
    });
    mockPrisma.connectedAccount.findUnique.mockResolvedValue(row("mail"));
    const token = await TokenManager.getInstance().getValidAccessToken(
      "GOOGLE_MAIL",
      "acc-1",
      "u1"
    );
    expect(token).toBe("from-mail");
    expect(createGoogleOAuthClient).not.toHaveBeenCalled();
  });
});

describe("storeTokens records the issuing client", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.connectedAccount.findFirst.mockResolvedValue(null);
    mockPrisma.connectedAccount.create.mockResolvedValue({ id: "new" });
  });

  it("writes oauthClient for a Google grant", async () => {
    await TokenManager.getInstance().storeTokens(
      "GOOGLE_MAIL",
      "me@example.com",
      { accessToken: "a", refreshToken: "r", expiresAt: new Date() },
      "u1",
      { oauthClient: "mail" }
    );
    expect(
      mockPrisma.connectedAccount.create.mock.calls[0][0].data
    ).toMatchObject({ provider: "GOOGLE_MAIL", oauthClient: "mail" });
  });

  it("leaves oauthClient out when none is given", async () => {
    await TokenManager.getInstance().storeTokens(
      "GOOGLE",
      "me@example.com",
      { accessToken: "a", expiresAt: new Date() },
      "u1"
    );
    expect(
      mockPrisma.connectedAccount.create.mock.calls[0][0].data
    ).not.toHaveProperty("oauthClient");
  });
});
