import { backfillProviderSecrets } from "@/services/security/provider-secrets-backfill";

import { prisma } from "@/lib/prisma";
import {
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
} from "@/lib/security/secret-encryption";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    connectedAccount: { findMany: jest.fn(), updateMany: jest.fn() },
    taskProvider: { findMany: jest.fn(), updateMany: jest.fn() },
    account: { findMany: jest.fn(), updateMany: jest.fn() },
    systemSettings: { findMany: jest.fn(), updateMany: jest.fn() },
  },
}));
jest.mock("@/lib/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

type Delegate = { findMany: jest.Mock; updateMany: jest.Mock };
const mockPrisma = prisma as unknown as {
  connectedAccount: Delegate;
  taskProvider: Delegate;
  account: Delegate;
  systemSettings: Delegate;
};

// Serves rows like Prisma cursor pagination does: ordered by id, `skip: 1`
// past the cursor.
function serve(delegate: Delegate, rows: Array<Record<string, unknown>>) {
  delegate.findMany.mockImplementation(
    async (args: { take: number; cursor?: { id: string } }) => {
      const start = args.cursor
        ? rows.findIndex((row) => row.id === args.cursor!.id) + 1
        : 0;
      return rows.slice(start, start + args.take);
    }
  );
  delegate.updateMany.mockResolvedValue({ count: 1 });
}

describe("backfillProviderSecrets", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    serve(mockPrisma.taskProvider, []);
    serve(mockPrisma.account, []);
    serve(mockPrisma.systemSettings, []);
  });

  it("encrypts system settings secrets and leaves empty ones alone", async () => {
    serve(mockPrisma.connectedAccount, []);
    serve(mockPrisma.systemSettings, [
      {
        id: "default",
        googleClientSecret: "google-client-secret-value",
        outlookClientSecret: "",
        resendApiKey: null,
      },
    ]);

    const encrypted = await backfillProviderSecrets();
    expect(encrypted.systemSettings).toEqual({
      scanned: 1,
      updated: 1,
      skipped: 0,
      failed: 0,
    });
    const { where, data } =
      mockPrisma.systemSettings.updateMany.mock.calls[0][0];
    expect(where).toEqual({
      id: "default",
      googleClientSecret: "google-client-secret-value",
      outlookClientSecret: "",
      resendApiKey: null,
    });
    expect(isEncryptedSecret(data.googleClientSecret)).toBe(true);
    expect(decryptSecret(data.googleClientSecret)).toBe(
      "google-client-secret-value"
    );
    expect(data.outlookClientSecret).toBe("");
    expect(data.resendApiKey).toBeNull();
  });

  it("encrypts plaintext rows and skips rows that are already encrypted", async () => {
    const alreadyEncrypted = encryptSecret("done");
    serve(mockPrisma.connectedAccount, [
      { id: "a", accessToken: "plain-access", refreshToken: "plain-refresh" },
      { id: "b", accessToken: alreadyEncrypted, refreshToken: null },
      { id: "c", accessToken: "caldav-password", refreshToken: null },
    ]);

    const result = await backfillProviderSecrets({ batchSize: 2 });

    expect(result.connectedAccount).toEqual({
      scanned: 3,
      updated: 2,
      skipped: 1,
      failed: 0,
    });
    const calls = mockPrisma.connectedAccount.updateMany.mock.calls.map(
      (call) => call[0]
    );
    expect(calls.map((call) => call.where.id)).toEqual(["a", "c"]);

    // Guarded on the values that were read, so a concurrent refresh wins.
    expect(calls[0].where).toEqual({
      id: "a",
      accessToken: "plain-access",
      refreshToken: "plain-refresh",
    });
    expect(decryptSecret(calls[0].data.accessToken)).toBe("plain-access");
    expect(decryptSecret(calls[0].data.refreshToken)).toBe("plain-refresh");
    expect(calls[1].data.refreshToken).toBeNull();
    expect(isEncryptedSecret(calls[1].data.accessToken)).toBe(true);
  });

  it("is a no-op on a second run", async () => {
    serve(mockPrisma.connectedAccount, [
      {
        id: "a",
        accessToken: encryptSecret("x"),
        refreshToken: encryptSecret("y"),
      },
    ]);
    serve(mockPrisma.account, [
      { id: "n", access_token: encryptSecret("x"), refresh_token: null },
      { id: "m", access_token: null, refresh_token: null },
    ]);

    const result = await backfillProviderSecrets();

    expect(mockPrisma.connectedAccount.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.account.updateMany).not.toHaveBeenCalled();
    expect(result.account).toEqual({
      scanned: 2,
      updated: 0,
      skipped: 2,
      failed: 0,
    });
  });

  it("counts a row changed concurrently as skipped", async () => {
    serve(mockPrisma.connectedAccount, [
      { id: "a", accessToken: "plain", refreshToken: null },
    ]);
    mockPrisma.connectedAccount.updateMany.mockResolvedValue({ count: 0 });

    const result = await backfillProviderSecrets();

    expect(result.connectedAccount.updated).toBe(0);
    expect(result.connectedAccount.skipped).toBe(1);
  });

  it("covers NextAuth Account tokens and leaves id_token alone", async () => {
    serve(mockPrisma.account, [
      {
        id: "n",
        access_token: "signin-access-fixture",
        refresh_token: "signin-refresh-fixture",
      },
    ]);
    serve(mockPrisma.connectedAccount, []);

    await backfillProviderSecrets();

    const [call] = mockPrisma.account.updateMany.mock.calls[0];
    expect(Object.keys(call.data).sort()).toEqual([
      "access_token",
      "refresh_token",
    ]);
    expect(decryptSecret(call.data.access_token)).toBe("signin-access-fixture");
  });

  it("decrypt direction restores plaintext for a rollback", async () => {
    serve(mockPrisma.connectedAccount, [
      { id: "a", accessToken: encryptSecret("p"), refreshToken: null },
      { id: "b", accessToken: "already-plain", refreshToken: null },
    ]);

    const result = await backfillProviderSecrets({ direction: "decrypt" });

    expect(result.connectedAccount.updated).toBe(1);
    const [call] = mockPrisma.connectedAccount.updateMany.mock.calls[0];
    expect(call.data).toEqual({ accessToken: "p", refreshToken: null });
  });
});
