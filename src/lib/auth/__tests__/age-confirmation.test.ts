import { cookies } from "next/headers";

import {
  AGE_CONFIRM_REDIRECT,
  AGE_COOKIE_TTL_SECONDS,
  ageConfirmationGate,
  issueAgeToken,
  verifyAgeToken,
} from "@/lib/auth/age-confirmation";
import { isExistingOAuthUser } from "@/lib/auth/signups";

const mockJar = { get: jest.fn() };
jest.mock("next/headers", () => ({
  cookies: jest.fn(async () => mockJar),
}));
jest.mock("@/lib/auth/signups", () => ({
  isExistingOAuthUser: jest.fn(),
}));

const NOW = Date.UTC(2026, 9, 29, 12, 0, 0);

describe("age confirmation token", () => {
  it("verifies a fresh token and rejects expired, tampered and empty ones", () => {
    const token = issueAgeToken(NOW);
    expect(verifyAgeToken(token, NOW + 1000)).toBe(true);
    expect(
      verifyAgeToken(token, NOW + (AGE_COOKIE_TTL_SECONDS + 1) * 1000)
    ).toBe(false);
    const [expiry] = token.split(".");
    expect(verifyAgeToken(`${expiry}.forged`, NOW)).toBe(false);
    expect(verifyAgeToken(`${Number(expiry) + 99999}.x`, NOW)).toBe(false);
    expect(verifyAgeToken("", NOW)).toBe(false);
    expect(verifyAgeToken(undefined, NOW)).toBe(false);
  });
});

describe("ageConfirmationGate", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockJar.get.mockReturnValue(undefined);
    jest.mocked(cookies).mockResolvedValue(mockJar as never);
  });

  const google = {
    provider: "google",
    providerAccountId: "g-1",
    email: "a@example.com",
    nowMs: NOW,
  };

  it("never blocks credentials sign-in", async () => {
    await expect(
      ageConfirmationGate({ ...google, provider: "credentials" })
    ).resolves.toBe(true);
  });

  it("lets an existing account through without the cookie", async () => {
    jest.mocked(isExistingOAuthUser).mockResolvedValue(true);
    await expect(ageConfirmationGate(google)).resolves.toBe(true);
  });

  it("sends a new OAuth account without the cookie back to sign-in", async () => {
    jest.mocked(isExistingOAuthUser).mockResolvedValue(false);
    await expect(ageConfirmationGate(google)).resolves.toBe(
      AGE_CONFIRM_REDIRECT
    );
  });

  it("lets a new OAuth account through with a valid cookie", async () => {
    jest.mocked(isExistingOAuthUser).mockResolvedValue(false);
    mockJar.get.mockReturnValue({ value: issueAgeToken(NOW) });
    await expect(ageConfirmationGate(google)).resolves.toBe(true);
  });

  it("refuses an expired or forged cookie", async () => {
    jest.mocked(isExistingOAuthUser).mockResolvedValue(false);
    mockJar.get.mockReturnValue({ value: "9999999999.forged" });
    await expect(ageConfirmationGate(google)).resolves.toBe(
      AGE_CONFIRM_REDIRECT
    );
  });

  it("fails closed when the account lookup throws", async () => {
    jest.mocked(isExistingOAuthUser).mockRejectedValue(new Error("db down"));
    await expect(ageConfirmationGate(google)).resolves.toBe(
      AGE_CONFIRM_REDIRECT
    );
  });
});
