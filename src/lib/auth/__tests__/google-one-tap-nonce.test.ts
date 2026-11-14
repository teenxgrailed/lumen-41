import {
  ONE_TAP_NONCE_COOKIE,
  ONE_TAP_NONCE_TTL_SECONDS,
  issueOneTapNonce,
  oneTapNonceCookieName,
  readOneTapNonce,
  unverifiedTokenNonce,
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

describe("one cookie per nonce", () => {
  it("names the cookie after the nonce, so two prompts never share one", () => {
    const a = issueOneTapNonce(NOW).nonce;
    const b = issueOneTapNonce(NOW).nonce;
    expect(oneTapNonceCookieName(a)).toMatch(
      new RegExp(`^${ONE_TAP_NONCE_COOKIE}_[0-9a-f]{16}$`)
    );
    expect(oneTapNonceCookieName(a)).toBe(oneTapNonceCookieName(a));
    expect(oneTapNonceCookieName(a)).not.toBe(oneTapNonceCookieName(b));
  });

  it("outlives the ID token (about an hour)", () => {
    expect(ONE_TAP_NONCE_TTL_SECONDS).toBeGreaterThan(60 * 60);
  });

  it("reads the nonce claim of a token without trusting it", () => {
    const payload = Buffer.from(JSON.stringify({ nonce: "abc" })).toString(
      "base64url"
    );
    expect(unverifiedTokenNonce(`h.${payload}.s`)).toBe("abc");
    expect(unverifiedTokenNonce("garbage")).toBeNull();
    expect(unverifiedTokenNonce("h.!!!.s")).toBeNull();
    expect(unverifiedTokenNonce(42)).toBeNull();
    const none = Buffer.from("{}").toString("base64url");
    expect(unverifiedTokenNonce(`h.${none}.s`)).toBeNull();
  });
});
