import { Resend } from "resend";

import { getGoogleCredentials, getOutlookCredentials } from "@/lib/auth";
import { clearResendInstance, getResend } from "@/lib/email/resend";
import { prisma } from "@/lib/prisma";
import {
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
} from "@/lib/security/secret-encryption";
import {
  openSystemSettingsSecrets,
  sealSystemSettingsSecrets,
} from "@/lib/system-settings-secrets";

jest.mock("@/lib/prisma", () => ({
  prisma: { systemSettings: { findFirst: jest.fn() } },
}));
jest.mock("@/lib/logger", () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));
jest.mock("resend", () => ({ Resend: jest.fn() }));

const findFirst = jest.mocked(prisma.systemSettings.findFirst);

const stored = {
  id: "default",
  googleClientId: "google-client-id",
  googleClientSecret: encryptSecret("google-client-secret-value"),
  outlookClientId: "outlook-client-id",
  outlookClientSecret: encryptSecret("outlook-client-secret-value"),
  outlookTenantId: "common",
  resendApiKey: encryptSecret("resend-api-key-value"),
};

beforeEach(() => {
  jest.clearAllMocks();
  clearResendInstance();
  process.env.DATABASE_URL ||= "postgresql://localhost/test";
});

describe("sealSystemSettingsSecrets", () => {
  it("encrypts secret fields and leaves the rest alone", () => {
    const sealed = sealSystemSettingsSecrets({
      googleClientSecret: "google-client-secret-value",
      resendApiKey: "resend-api-key-value",
      googleClientId: "google-client-id",
      disableHomepage: true,
    });

    expect(isEncryptedSecret(sealed.googleClientSecret)).toBe(true);
    expect(decryptSecret(sealed.googleClientSecret)).toBe(
      "google-client-secret-value"
    );
    expect(isEncryptedSecret(sealed.resendApiKey)).toBe(true);
    expect(sealed.googleClientId).toBe("google-client-id");
    expect(sealed.disableHomepage).toBe(true);
    expect(sealed).not.toHaveProperty("outlookClientSecret");
  });

  it("keeps empty and null values as they are", () => {
    expect(
      sealSystemSettingsSecrets({ outlookClientSecret: "", resendApiKey: null })
    ).toEqual({ outlookClientSecret: "", resendApiKey: null });
  });

  it("does not encrypt twice", () => {
    const once = encryptSecret("google-client-secret-value");
    expect(sealSystemSettingsSecrets({ googleClientSecret: once })).toEqual({
      googleClientSecret: once,
    });
  });
});

describe("openSystemSettingsSecrets", () => {
  it("decrypts ciphertext and passes legacy plaintext through", () => {
    expect(
      openSystemSettingsSecrets({
        googleClientSecret: encryptSecret("google-client-secret-value"),
        outlookClientSecret: "legacy-plaintext-secret",
        resendApiKey: null,
      })
    ).toEqual({
      googleClientSecret: "google-client-secret-value",
      outlookClientSecret: "legacy-plaintext-secret",
      resendApiKey: null,
    });
  });
});

describe("readers hand plaintext to the providers", () => {
  it("getGoogleCredentials decrypts the stored client secret", async () => {
    findFirst.mockResolvedValue(stored as never);
    await expect(getGoogleCredentials()).resolves.toEqual({
      clientId: "google-client-id",
      clientSecret: "google-client-secret-value",
    });
  });

  it("getOutlookCredentials decrypts the stored client secret", async () => {
    findFirst.mockResolvedValue(stored as never);
    await expect(getOutlookCredentials()).resolves.toMatchObject({
      clientId: "outlook-client-id",
      clientSecret: "outlook-client-secret-value",
      tenantId: "common",
    });
  });

  it("getResend builds the client with the decrypted key", async () => {
    findFirst.mockResolvedValue(stored as never);
    await getResend();
    expect(Resend).toHaveBeenCalledWith("resend-api-key-value");
  });
});
