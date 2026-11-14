import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { authSecret } from "@/lib/auth/auth-secret";

/**
 * A One Tap ID token carries a nonce this server chose: the page asks
 * /api/auth/google-client for one, Google puts it in the token, and the
 * sign-in accepts the token only with the same nonce from a signed, httpOnly,
 * short-lived cookie. A token captured elsewhere cannot be replayed (the
 * attacker has no cookie), and the cookie is cleared by the first success.
 *
 * One cookie per nonce (the name carries a hash of the nonce), so a second
 * tab, or React StrictMode's double effect, cannot overwrite the cookie of the
 * nonce another prompt already holds. The cookie outlives the ID token (Google
 * issues them for about an hour), so a tap on an old prompt still works.
 */
export const ONE_TAP_NONCE_COOKIE = "needt_onetap_nonce";
export const ONE_TAP_NONCE_TTL_SECONDS = 75 * 60;

/** The cookie that holds the proof for one nonce. */
export function oneTapNonceCookieName(nonce: string): string {
  return `${ONE_TAP_NONCE_COOKIE}_${createHash("sha256")
    .update(nonce)
    .digest("hex")
    .slice(0, 16)}`;
}

/**
 * The nonce claim of an ID token, read WITHOUT verifying it: only to pick the
 * cookie to look in. Trust comes from the signed cookie and the token's
 * signature, never from this.
 */
export function unverifiedTokenNonce(credential: unknown): string | null {
  if (typeof credential !== "string" || credential.length > 8192) return null;
  const payload = credential.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    return typeof claims?.nonce === "string" && claims.nonce
      ? claims.nonce
      : null;
  } catch {
    return null;
  }
}

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

/** The nonce cookie of the current request that belongs to this credential. */
export async function currentOneTapNonce(nowMs: number, credential: unknown) {
  const claimed = unverifiedTokenNonce(credential);
  if (!claimed) return null;
  try {
    const { cookies } = await import("next/headers");
    const jar = await cookies();
    const proven = readOneTapNonce(
      jar.get(oneTapNonceCookieName(claimed))?.value,
      nowMs
    );
    return proven === claimed ? proven : null;
  } catch {
    return null;
  }
}

/** How many nonce cookies one browser keeps: the one just issued and the one
    before it (a second tab, or a prompt that is still open). */
export const ONE_TAP_NONCE_COOKIES_KEPT = 2;

type JarCookie = { name: string; value: string };

function isNonceCookie(name: string): boolean {
  return name.startsWith(`${ONE_TAP_NONCE_COOKIE}_`);
}

/** Expiry (seconds) written in a cookie value, 0 when unreadable. Only used to
    order cookies, never to trust one. */
function cookieExpiry(value: string): number {
  const expiry = Number(value.split(".")[1]);
  return Number.isFinite(expiry) ? expiry : 0;
}

/**
 * Names of the nonce cookies to expire when `issuedName` has just been
 * issued: every one except the newest `ONE_TAP_NONCE_COOKIES_KEPT - 1` others
 * (newest by the expiry in the value), so the jar never grows past the cap.
 */
export function staleOneTapNonceCookies(
  jar: JarCookie[],
  issuedName: string
): string[] {
  const others = jar
    .filter((c) => isNonceCookie(c.name) && c.name !== issuedName)
    .sort((a, b) => cookieExpiry(b.value) - cookieExpiry(a.value));
  return others.slice(ONE_TAP_NONCE_COOKIES_KEPT - 1).map((c) => c.name);
}

/** Every nonce cookie in the jar: all of them go on a successful sign-in. */
export function allOneTapNonceCookies(jar: JarCookie[]): string[] {
  return jar.filter((c) => isNonceCookie(c.name)).map((c) => c.name);
}

/** A Set-Cookie header value that expires a nonce cookie. */
export function expireOneTapNonceCookie(name: string): string {
  return `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`;
}
