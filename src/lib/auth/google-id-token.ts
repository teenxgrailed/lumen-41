import { createPublicKey, verify as verifySignature } from "node:crypto";
import type { JsonWebKey } from "node:crypto";

import { newDate } from "@/lib/date-utils";

const GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS: readonly string[] = [
  "https://accounts.google.com",
  "accounts.google.com",
];
/** Seconds of clock drift between Google and this server that are forgiven. */
const CLOCK_TOLERANCE_SECONDS = 30;
const CERTS_FALLBACK_TTL_MS = 60 * 60 * 1000;

export type GoogleIdTokenFailure =
  | "malformed"
  | "algorithm"
  | "unknown-key"
  | "signature"
  | "issuer"
  | "audience"
  | "expired"
  | "not-yet-valid"
  | "nonce"
  | "email-unverified"
  | "incomplete";

export class GoogleIdTokenError extends Error {
  constructor(public readonly reason: GoogleIdTokenFailure) {
    super(`Google ID token refused: ${reason}`);
    this.name = "GoogleIdTokenError";
  }
}

/** The claims a verified Google ID token vouches for. */
export interface GoogleIdentity {
  /** Google's stable account id; the provider account id we store. */
  sub: string;
  /** Lower-cased and verified by Google. */
  email: string;
  name: string | null;
  picture: string | null;
  /** Workspace domain: present only when Google owns the address's domain. */
  hd: string | null;
  /** When Google issued the token (ms); the moment the person proved it. */
  issuedAtMs: number;
}

type Jwk = JsonWebKey & { kid?: string };
/** `force`: the cache has no key with the token's id; fetch again. */
export type GoogleKeySource = (options?: {
  force?: boolean;
}) => Promise<readonly Jwk[]>;

const CERTS_TIMEOUT_MS = 3000;
/** A forced refetch (rotated key) happens at most this often. */
const FORCED_REFETCH_MIN_INTERVAL_MS = 60_000;

let certsCache: { keys: readonly Jwk[]; expiresAt: number } | null = null;
let lastForcedFetchAt = 0;

/** Test hook: forget the cached Google signing keys. */
export function resetGoogleCertsCache() {
  certsCache = null;
  lastForcedFetchAt = 0;
}

/** Google's current signing keys, cached for as long as Google says. */
export const fetchGoogleKeys: GoogleKeySource = async (options) => {
  const now = newDate().getTime();
  const forced =
    options?.force === true &&
    now - lastForcedFetchAt >= FORCED_REFETCH_MIN_INTERVAL_MS;
  if (certsCache && certsCache.expiresAt > now && !forced) {
    return certsCache.keys;
  }
  if (forced) lastForcedFetchAt = now;
  const response = await fetch(GOOGLE_CERTS_URL, {
    cache: "no-store",
    signal: AbortSignal.timeout(CERTS_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Google certs answered ${response.status}`);
  const body = (await response.json()) as { keys?: Jwk[] };
  const keys = Array.isArray(body.keys) ? body.keys : [];
  const maxAge = /max-age=(\d+)/.exec(
    response.headers.get("cache-control") ?? ""
  );
  const ttl = maxAge ? Number(maxAge[1]) * 1000 : CERTS_FALLBACK_TTL_MS;
  certsCache = { keys, expiresAt: now + Math.max(ttl, 60_000) };
  return keys;
};

function decodePart(part: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(
      Buffer.from(part, "base64url").toString("utf8")
    );
    return value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Checks a Google Identity Services credential the way Google documents it
 * (https://developers.google.com/identity/gsi/web/guides/verify-google-id-token):
 * RS256 signature against Google's published keys, issuer, audience (our own
 * client id), expiry and a verified email. Throws `GoogleIdTokenError`.
 */
export async function verifyGoogleIdToken(
  credential: unknown,
  options: {
    clientId: string;
    keys?: GoogleKeySource;
    nowMs?: number;
    /** The nonce this page asked Google to put in the token. */
    nonce: string;
  }
): Promise<GoogleIdentity> {
  if (typeof credential !== "string" || credential.length > 8192) {
    throw new GoogleIdTokenError("malformed");
  }
  const parts = credential.split(".");
  if (parts.length !== 3) throw new GoogleIdTokenError("malformed");
  const header = decodePart(parts[0]);
  const claims = decodePart(parts[1]);
  if (!header || !claims) throw new GoogleIdTokenError("malformed");
  if (header.alg !== "RS256") throw new GoogleIdTokenError("algorithm");

  const source = options.keys ?? fetchGoogleKeys;
  const find = (list: readonly Jwk[]) =>
    list.find((key) => key.kid && key.kid === header.kid);
  /* A key Google rotated in since the cache was filled: look once more. */
  const jwk = find(await source()) ?? find(await source({ force: true }));
  if (!jwk) throw new GoogleIdTokenError("unknown-key");

  const signatureOk = verifySignature(
    "RSA-SHA256",
    Buffer.from(`${parts[0]}.${parts[1]}`),
    createPublicKey({ key: jwk, format: "jwk" }),
    Buffer.from(parts[2], "base64url")
  );
  if (!signatureOk) throw new GoogleIdTokenError("signature");

  if (typeof claims.iss !== "string" || !GOOGLE_ISSUERS.includes(claims.iss)) {
    throw new GoogleIdTokenError("issuer");
  }
  const audience = claims.aud;
  const audiences = Array.isArray(audience) ? audience : [audience];
  if (!options.clientId || !audiences.includes(options.clientId)) {
    throw new GoogleIdTokenError("audience");
  }
  const nowSeconds = Math.floor((options.nowMs ?? newDate().getTime()) / 1000);
  if (
    typeof claims.exp !== "number" ||
    claims.exp + CLOCK_TOLERANCE_SECONDS <= nowSeconds
  ) {
    throw new GoogleIdTokenError("expired");
  }
  /* `iat` becomes the re-authentication stamp, so a token without it is not
     accepted (Google always sends it). */
  if (typeof claims.iat !== "number" || !Number.isFinite(claims.iat)) {
    throw new GoogleIdTokenError("incomplete");
  }
  if (claims.iat - CLOCK_TOLERANCE_SECONDS > nowSeconds) {
    throw new GoogleIdTokenError("not-yet-valid");
  }
  if (
    !options.nonce ||
    typeof claims.nonce !== "string" ||
    claims.nonce !== options.nonce
  ) {
    throw new GoogleIdTokenError("nonce");
  }
  const verified = claims.email_verified;
  if (verified !== true && verified !== "true") {
    throw new GoogleIdTokenError("email-unverified");
  }
  const email =
    typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  if (typeof claims.sub !== "string" || !claims.sub || !email.includes("@")) {
    throw new GoogleIdTokenError("incomplete");
  }
  return {
    sub: claims.sub,
    email,
    name: typeof claims.name === "string" ? claims.name : null,
    picture: typeof claims.picture === "string" ? claims.picture : null,
    hd: typeof claims.hd === "string" && claims.hd ? claims.hd : null,
    issuedAtMs: claims.iat * 1000,
  };
}
