import {
  ONE_TAP_NONCE_TTL_SECONDS,
  issueOneTapNonce,
  readOneTapNonce,
} from "@/lib/auth/google-one-tap-nonce";

jest.mock("@/lib/auth/auth-secret", () => ({
  authSecret: () => "test-secret-test-secret-test-secret",
}));

const NOW = Date.UTC(2026, 10, 14, 12, 0, 0);

describe("the One Tap nonce cookie", () => {
  it("round-trips the nonce while it is fresh", () => {
    const { nonce, cookie } = issueOneTapNonce(NOW);
    expect(readOneTapNonce(cookie, NOW + 1000)).toBe(nonce);
  });

  it("is random per request", () => {
    expect(issueOneTapNonce(NOW).nonce).not.toBe(issueOneTapNonce(NOW).nonce);
  });

  it("expires", () => {
    const { cookie } = issueOneTapNonce(NOW);
    const later = NOW + (ONE_TAP_NONCE_TTL_SECONDS + 1) * 1000;
    expect(readOneTapNonce(cookie, later)).toBeNull();
  });

  it("rejects a forged or edited cookie", () => {
    const { nonce, cookie } = issueOneTapNonce(NOW);
    const [, expiry, sig] = cookie.split(".");
    expect(readOneTapNonce(`other.${expiry}.${sig}`, NOW)).toBeNull();
    expect(readOneTapNonce(`${nonce}.${expiry}.bad`, NOW)).toBeNull();
    expect(readOneTapNonce("garbage", NOW)).toBeNull();
    expect(readOneTapNonce(undefined, NOW)).toBeNull();
  });
});
