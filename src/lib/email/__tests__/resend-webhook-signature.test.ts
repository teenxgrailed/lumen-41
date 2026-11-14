import { checkSvixSignature, verifySvixSignature } from "../resend-webhook";

jest.mock("@/lib/prisma", () => ({ prisma: {} }));
jest.mock("@/lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

/* Published Svix test vector (svix-webhooks javascript/src/webhook.test.ts). */
const SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
const ID = "msg_p5jXN8AQM9LWM0D4loKWxJek";
const TIMESTAMP = 1614265330;
const PAYLOAD = '{"test": 2432232314}';
const EXPECTED = "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=";

const base = {
  secret: SECRET,
  id: ID,
  timestamp: String(TIMESTAMP),
  body: PAYLOAD,
  nowSeconds: TIMESTAMP,
};

describe("verifySvixSignature", () => {
  it("accepts the Svix published test vector", () => {
    expect(verifySvixSignature({ ...base, signature: EXPECTED })).toBe(true);
  });

  it("accepts a header with several signatures when only the second matches", () => {
    const signature = `v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= ${EXPECTED}`;
    expect(verifySvixSignature({ ...base, signature })).toBe(true);
  });

  it("refuses a changed body", () => {
    const result = checkSvixSignature({
      ...base,
      body: '{"test": 2432232315}',
      signature: EXPECTED,
    });
    expect(result).toEqual({ ok: false, reason: "no_match", skewSeconds: 0 });
  });

  it("reports stale_timestamp with the skew", () => {
    const result = checkSvixSignature({
      ...base,
      nowSeconds: TIMESTAMP + 301,
      signature: EXPECTED,
    });
    expect(result).toEqual({
      ok: false,
      reason: "stale_timestamp",
      skewSeconds: 301,
    });
  });

  it("reports missing_headers", () => {
    expect(checkSvixSignature({ ...base, signature: null })).toEqual({
      ok: false,
      reason: "missing_headers",
      skewSeconds: null,
    });
  });
});
