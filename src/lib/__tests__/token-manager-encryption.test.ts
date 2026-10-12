import { createGoogleOAuthClient } from "@/lib/google";
import { prisma } from "@/lib/prisma";
import {
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
} from "@/lib/security/secret-encryption";
import { TokenManager } from "@/lib/token-manager";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    connectedAccount: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));
jest.mock("@/lib/auth", () => ({
  getOutlookCredentials: jest.fn(async () => ({
    clientId: "client",
    clientSecret: "secret",
  })),
}));
jest.mock("@/lib/google", () => ({ createGoogleOAuthClient: jest.fn() }));
jest.mock("@/lib/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockPrisma = prisma as unknown as {
  connectedAccount: { findUnique: jest.Mock; update: jest.Mock };
};

const future = new Date("2099-01-01T00:00:00.000Z");
const past = new Date("2000-01-01T00:00:00.000Z");

// The mocked update echoes its data back, the way Prisma returns the row.
function echoUpdate() {
  mockPrisma.connectedAccount.update.mockImplementation(
    async ({ data }: { data: Record<string, unknown> }) => ({
      id: "acc-1",
      ...data,
    })
  );
}

describe("TokenManager with encrypted storage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns plaintext from encrypted rows", async () => {
    mockPrisma.connectedAccount.findUnique.mockResolvedValue({
      id: "acc-1",
      accessToken: encryptSecret("access-enc"),
      refreshToken: encryptSecret("refresh-enc"),
      expiresAt: future,
    });

    await expect(
      TokenManager.getInstance().getTokens("acc-1", "user-1")
    ).resolves.toEqual({
      accessToken: "access-enc",
      refreshToken: "refresh-enc",
      expiresAt: future,
    });
  });

  it("still reads rows written before encryption", async () => {
    mockPrisma.connectedAccount.findUnique.mockResolvedValue({
      id: "acc-1",
      accessToken: "legacy-access",
      refreshToken: null,
      expiresAt: future,
    });

    await expect(
      TokenManager.getInstance().getValidAccessToken(
        "GOOGLE",
        "acc-1",
        "user-1"
      )
    ).resolves.toBe("legacy-access");
  });

  it("Google refresh sends the plaintext refresh token and stores both tokens encrypted", async () => {
    const setCredentials = jest.fn();
    (createGoogleOAuthClient as jest.Mock).mockResolvedValue({
      setCredentials,
      refreshAccessToken: jest.fn(async () => ({
        credentials: {
          access_token: "new-google-access",
          expiry_date: future.getTime(),
        },
      })),
    });
    mockPrisma.connectedAccount.findUnique.mockResolvedValue({
      id: "acc-1",
      accessToken: encryptSecret("old-access"),
      refreshToken: encryptSecret("google-refresh"),
      expiresAt: past,
    });
    echoUpdate();

    const tokens = await TokenManager.getInstance().refreshGoogleTokens(
      "acc-1",
      "user-1"
    );

    expect(setCredentials).toHaveBeenCalledWith({
      refresh_token: "google-refresh",
    });
    const { data } = mockPrisma.connectedAccount.update.mock.calls[0][0];
    expect(isEncryptedSecret(data.accessToken)).toBe(true);
    expect(isEncryptedSecret(data.refreshToken)).toBe(true);
    expect(decryptSecret(data.accessToken)).toBe("new-google-access");
    expect(decryptSecret(data.refreshToken)).toBe("google-refresh");
    expect(tokens).toEqual({
      accessToken: "new-google-access",
      refreshToken: "google-refresh",
      expiresAt: future,
    });
  });

  it("Outlook refresh encrypts a legacy plaintext row on its next write", async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        access_token: "new-outlook-access",
        refresh_token: "new-outlook-refresh",
        expires_in: 3600,
      }),
    }));
    global.fetch = fetchMock as unknown as typeof fetch;
    mockPrisma.connectedAccount.findUnique.mockResolvedValue({
      id: "acc-1",
      accessToken: "legacy-access",
      refreshToken: "legacy-refresh",
      expiresAt: past,
    });
    echoUpdate();

    const tokens = await TokenManager.getInstance().refreshOutlookTokens(
      "acc-1",
      "user-1"
    );

    const body = (fetchMock.mock.calls[0] as unknown[])[1] as { body: string };
    expect(new URLSearchParams(body.body).get("refresh_token")).toBe(
      "legacy-refresh"
    );
    const { data } = mockPrisma.connectedAccount.update.mock.calls[0][0];
    expect(data.accessToken).not.toContain("new-outlook-access");
    expect(decryptSecret(data.accessToken)).toBe("new-outlook-access");
    expect(decryptSecret(data.refreshToken)).toBe("new-outlook-refresh");
    expect(tokens?.accessToken).toBe("new-outlook-access");
  });
});
