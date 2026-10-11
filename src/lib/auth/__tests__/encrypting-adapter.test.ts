import type { NextAuthOptions } from "next-auth";

import { withEncryptedAccountTokens } from "@/lib/auth/encrypting-adapter";
import {
  decryptSecret,
  isEncryptedSecret,
} from "@/lib/security/secret-encryption";

jest.mock("@/lib/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

type AuthAdapter = NonNullable<NextAuthOptions["adapter"]>;

describe("withEncryptedAccountTokens", () => {
  it("encrypts OAuth tokens before the adapter writes the Account row", async () => {
    const linkAccount = jest.fn(async () => undefined);
    const getUser = jest.fn();
    const adapter = withEncryptedAccountTokens({
      linkAccount,
      getUser,
    } as unknown as AuthAdapter);

    await adapter.linkAccount!({
      userId: "user-1",
      type: "oauth",
      provider: "google",
      providerAccountId: "123",
      access_token: "ya29.access",
      refresh_token: "1//refresh",
      id_token: "eyJ.id.token",
      expires_at: 1,
    } as never);

    const written = (linkAccount.mock.calls[0] as unknown[])[0] as Record<
      string,
      unknown
    >;
    expect(isEncryptedSecret(written.access_token as string)).toBe(true);
    expect(decryptSecret(written.access_token as string)).toBe("ya29.access");
    expect(decryptSecret(written.refresh_token as string)).toBe("1//refresh");
    expect(written.id_token).toBe("eyJ.id.token");
    expect(written.providerAccountId).toBe("123");
    expect(adapter.getUser).toBe(getUser);
  });

  it("leaves missing tokens missing", async () => {
    const linkAccount = jest.fn(async () => undefined);
    const adapter = withEncryptedAccountTokens({
      linkAccount,
    } as unknown as AuthAdapter);

    await adapter.linkAccount!({
      userId: "user-1",
      type: "oauth",
      provider: "azure-ad",
      providerAccountId: "456",
    } as never);

    const written = (linkAccount.mock.calls[0] as unknown[])[0] as Record<
      string,
      unknown
    >;
    expect(written.access_token).toBeUndefined();
    expect(written.refresh_token).toBeUndefined();
  });
});
