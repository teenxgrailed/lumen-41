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
}

type Jwk = JsonWebKey & { kid?: string };
export type GoogleKeySource = () => Promise<readonly Jwk[]>;

let certsCache: { keys: readonly Jwk[]; expiresAt: number } | null = null;

/** Test hook: forget the cached Google signing keys. */
export function resetGoogleCertsCache() {
  certsCache = null;
}

/** Google's current signing keys, cached for as long as Google says. */
export const fetchGoogleKeys: GoogleKeySource = async () => {
  const now = newDate().getTime();
  if (certsCache && certsCache.expiresAt > now) return certsCache.keys;
  const response = await fetch(GOOGLE_CERTS_URL, { cache: "no-store" });
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

  const keys = await (options.keys ?? fetchGoogleKeys)();
  const jwk = keys.find((key) => key.kid && key.kid === header.kid);
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
  if (
    typeof claims.iat === "number" &&
    claims.iat - CLOCK_TOLERANCE_SECONDS > nowSeconds
  ) {
    throw new GoogleIdTokenError("not-yet-valid");
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
  };
}
