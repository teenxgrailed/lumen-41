import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { authSecret } from "@/lib/auth/auth-secret";

/**
 * A One Tap ID token carries a nonce this server chose: the page asks
 * /api/auth/google-client for one, Google puts it in the token, and the
 * sign-in accepts the token only with the same nonce from a signed, httpOnly,
 * short-lived cookie. A token captured elsewhere cannot be replayed (the
 * attacker has no cookie), and the cookie is cleared by the first success.
 */
export const ONE_TAP_NONCE_COOKIE = "needt_onetap_nonce";
export const ONE_TAP_NONCE_TTL_SECONDS = 30 * 60;

function signature(nonce: string, expiry: string): string {
  return createHmac("sha256", authSecret())
    .update(`onetap-nonce:${nonce}:${expiry}`)
    .digest("base64url");
}

/** A fresh nonce and the cookie value that proves it was ours. */
export function issueOneTapNonce(nowMs: number): {
  nonce: string;
  cookie: string;
} {
  const nonce = randomBytes(24).toString("base64url");
  const expiry = String(Math.floor(nowMs / 1000) + ONE_TAP_NONCE_TTL_SECONDS);
  return { nonce, cookie: `${nonce}.${expiry}.${signature(nonce, expiry)}` };
}

/** The nonce inside a cookie value, or null when forged or expired. */
export function readOneTapNonce(
  cookie: string | undefined | null,
  nowMs: number
): string | null {
  if (!cookie) return null;
  const [nonce, expiry, candidate] = cookie.split(".");
  if (!nonce || !expiry || !candidate || !/^\d{1,12}$/.test(expiry)) {
    return null;
  }
  const expected = Buffer.from(signature(nonce, expiry));
  const given = Buffer.from(candidate);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return null;
  }
  return Number(expiry) > Math.floor(nowMs / 1000) ? nonce : null;
}

/** The current request's nonce cookie, valid and unexpired. */
export async function currentOneTapNonce(nowMs: number) {
  try {
    const { cookies } = await import("next/headers");
    const jar = await cookies();
    return readOneTapNonce(jar.get(ONE_TAP_NONCE_COOKIE)?.value, nowMs);
  } catch {
    return null;
  }
}
