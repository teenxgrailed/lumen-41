import crypto from "crypto";

export function randomToken(prefix: string): string {
  return `${prefix}${crypto.randomBytes(32).toString("base64url")}`;
}

export function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/** RFC 7636 verifier: 43–128 characters from the unreserved set. */
const VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;
/** S256 challenge: base64url of a sha256, 43 characters. */
const CHALLENGE = /^[A-Za-z0-9\-_]{43}$/;

export function isCodeChallenge(value: string): boolean {
  return CHALLENGE.test(value);
}

/** PKCE S256 only: BASE64URL(SHA256(verifier)) must equal the challenge. */
export function verifyPkce(verifier: string, challenge: string): boolean {
  if (!VERIFIER.test(verifier) || !CHALLENGE.test(challenge)) return false;
  const computed = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(challenge));
}
