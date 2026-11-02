import crypto from "crypto";
import { promisify } from "util";

import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { oauthIssuer } from "@/lib/mcp-config";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/security/secret-encryption";

import { sha256Hex } from "./crypto";

const LOG_SOURCE = "OAuthOidc";

/** An id_token is for the moment of sign-in only. */
export const ID_TOKEN_TTL_SECONDS = 300;

export interface PublicJwk {
  kty: "RSA";
  n: string;
  e: string;
  kid: string;
  alg: "RS256";
  use: "sig";
}

export interface SigningKey {
  privateKey: crypto.KeyObject;
  publicJwk: PublicJwk;
  kid: string;
}

/** The resource an OpenID Connect access token is bound to. */
export function userinfoResource(): string {
  return `${oauthIssuer()}/oauth/userinfo`;
}

/** An env file often flattens a PEM's newlines into literal `\n`. */
function normalizePem(raw: string): string {
  const pem = raw.trim();
  return pem.includes("\\n") && !pem.includes("\n")
    ? pem.replace(/\\n/g, "\n")
    : pem;
}

/** RFC 7638: SHA-256 of the required members in lexicographic order. */
function thumbprint(jwk: { e: string; n: string }): string {
  return crypto
    .createHash("sha256")
    .update(`{"e":"${jwk.e}","kty":"RSA","n":"${jwk.n}"}`)
    .digest("base64url");
}

/** Parses a PKCS#8 PEM into the signing key; null when it is not a usable RSA key. */
async function parseSigningKey(
  raw: string,
  label: string
): Promise<SigningKey | null> {
  try {
    const privateKey = crypto.createPrivateKey(normalizePem(raw));
    const bits = privateKey.asymmetricKeyDetails?.modulusLength ?? 0;
    if (privateKey.asymmetricKeyType !== "rsa" || bits < 2048) {
      await logger.error(
        `${label} is not an RSA key of at least 2048 bits`,
        { type: privateKey.asymmetricKeyType ?? "unknown", bits },
        LOG_SOURCE
      );
      return null;
    }
    const { n, e } = crypto
      .createPublicKey(privateKey)
      .export({ format: "jwk" });
    if (!n || !e) return null;
    const kid = thumbprint({ n, e });
    return {
      privateKey,
      kid,
      publicJwk: { kty: "RSA", n, e, kid, alg: "RS256", use: "sig" },
    };
  } catch {
    await logger.error(`${label} could not be read`, {}, LOG_SOURCE);
    return null;
  }
}

const generateRsaKeyPair = promisify(crypto.generateKeyPair);

/**
 * The key kept in SystemSettings.oidcSigningKey, encrypted (enc:v1) like the
 * other stored secrets. The first use makes one and stores it with
 * `updateMany ... where oidcSigningKey is null`, so when several processes
 * race only one write lands; every process then reads the column back and
 * signs with whatever won. Only the failure class is logged, never a value:
 * a database error can carry the data it was given.
 */
async function loadStoredSigningKey(): Promise<SigningKey | null> {
  try {
    const find = () =>
      prisma.systemSettings.findFirst({
        orderBy: { id: "asc" },
        select: { id: true, oidcSigningKey: true },
      });
    let row = await find();
    if (!row) {
      // Same id the settings screen uses, so a concurrent create collides on
      // the primary key instead of making a second row.
      await prisma.systemSettings
        .create({ data: { id: "default" }, select: { id: true } })
        .catch(() => undefined);
      row = await find();
    }
    if (!row) return null;

    if (!row.oidcSigningKey) {
      const { privateKey } = await generateRsaKeyPair("rsa", {
        modulusLength: 2048,
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
        publicKeyEncoding: { type: "spki", format: "pem" },
      });
      const sealed = encryptSecret(privateKey);
      await prisma.systemSettings.updateMany({
        where: { id: row.id, oidcSigningKey: null },
        data: { oidcSigningKey: sealed },
      });
      row = await find();
      if (!row?.oidcSigningKey) return null;
    }
    return await parseSigningKey(
      decryptSecret(row.oidcSigningKey),
      "The stored OIDC signing key"
    );
  } catch (error) {
    await logger.error(
      "The OIDC signing key could not be loaded or created",
      { reason: error instanceof Error ? error.name : "unknown" },
      LOG_SOURCE
    );
    return null;
  }
}

let envCache: { pem: string; key: SigningKey | null } | null = null;
let storedCache: SigningKey | null = null;

/** Forgets the parsed keys. For tests; a process keeps its key for life. */
export function resetSigningKeyCache(): void {
  envCache = null;
  storedCache = null;
}

/**
 * The key id_tokens are signed with. Env `OIDC_SIGNING_KEY` (a PKCS#8 PEM of
 * an RSA key of at least 2048 bits) wins when set; otherwise Needt makes its
 * own key once and keeps it encrypted in SystemSettings. null only when the
 * env value is unusable or the stored key cannot be read, made or encrypted
 * (for example no encryption key in production) — OpenID Connect then fails
 * with `server_error` and nothing else is affected. Parsed once; a failure to
 * load the stored key is not cached, so the next request tries again. The key
 * itself is never logged.
 */
export async function loadSigningKey(): Promise<SigningKey | null> {
  const raw = process.env.OIDC_SIGNING_KEY?.trim();
  if (raw) {
    if (envCache?.pem === raw) return envCache.key;
    const key = await parseSigningKey(raw, "OIDC_SIGNING_KEY");
    envCache = { pem: raw, key };
    return key;
  }
  if (storedCache) return storedCache;
  storedCache = await loadStoredSigningKey();
  return storedCache;
}

const base64url = (value: string) => Buffer.from(value).toString("base64url");

/** Claims an id_token and the userinfo endpoint share. */
export interface IdentityClaims {
  sub: string;
  email: string | null;
  email_verified: boolean;
  name: string | null;
}

/** Who a Needt user is, as OpenID Connect says it. null when they are gone. */
export async function identityClaims(
  userId: string
): Promise<IdentityClaims | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, emailVerified: true, name: true },
  });
  if (!user) return null;
  return {
    sub: user.id,
    email: user.email,
    email_verified: user.email != null && user.emailVerified != null,
    name: user.name,
  };
}

/** What a scope list lets out: `email` and `profile` are separate asks. */
export function claimsForScope(
  claims: IdentityClaims,
  scope: string
): Record<string, string | boolean> {
  const asked = scope.split(" ");
  const out: Record<string, string | boolean> = { sub: claims.sub };
  if (asked.includes("email") && claims.email !== null) {
    out.email = claims.email;
    out.email_verified = claims.email_verified;
  }
  if (asked.includes("profile") && claims.name !== null) {
    out.name = claims.name;
  }
  return out;
}

/**
 * A compact RS256 JWS. The header carries the key's RFC 7638 thumbprint as
 * `kid`; claims that are null are left out rather than sent as null.
 */
export async function signIdToken(input: {
  userId: string;
  clientId: string;
  nonce: string | null;
  authTime: Date;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}): Promise<string> {
  const key = await loadSigningKey();
  if (!key) throw new Error("OIDC_SIGNING_KEY is not configured");
  const iat = Math.floor(newDate().getTime() / 1000);
  const claims: Record<string, unknown> = {
    iss: oauthIssuer(),
    sub: input.userId,
    aud: input.clientId,
    iat,
    exp: iat + ID_TOKEN_TTL_SECONDS,
    auth_time: Math.floor(input.authTime.getTime() / 1000),
  };
  if (input.nonce !== null) claims.nonce = input.nonce;
  if (input.email !== null) {
    claims.email = input.email;
    claims.email_verified = input.emailVerified;
  }
  if (input.name !== null) claims.name = input.name;
  const signingInput = `${base64url(
    JSON.stringify({ alg: "RS256", typ: "JWT", kid: key.kid })
  )}.${base64url(JSON.stringify(claims))}`;
  const signature = crypto
    .sign("RSA-SHA256", Buffer.from(signingInput), key.privateKey)
    .toString("base64url");
  return `${signingInput}.${signature}`;
}

/**
 * The access token behind a userinfo request: ours, still live, issued for
 * userinfo and for `openid`. An MCP access token is bound to another
 * resource and is refused here, as this one is refused by the MCP server.
 */
export async function resolveUserinfoToken(token: string) {
  const stored = await prisma.oAuthToken.findUnique({
    where: { tokenHash: sha256Hex(token) },
    select: {
      userId: true,
      scope: true,
      type: true,
      resource: true,
      revokedAt: true,
      expiresAt: true,
    },
  });
  if (
    !stored ||
    stored.type !== "access" ||
    stored.revokedAt ||
    stored.expiresAt.getTime() <= newDate().getTime() ||
    stored.resource !== userinfoResource() ||
    !stored.scope.split(" ").includes("openid")
  ) {
    return null;
  }
  return { userId: stored.userId, scope: stored.scope };
}

/** OpenID Connect Discovery 1.0 document for the issuer. */
export function openidConfiguration() {
  const issuer = oauthIssuer();
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    userinfo_endpoint: `${issuer}/oauth/userinfo`,
    jwks_uri: `${issuer}/oauth/jwks`,
    end_session_endpoint: `${issuer}/oauth/logout`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
    scopes_supported: ["openid", "email", "profile"],
    claims_supported: [
      "iss",
      "sub",
      "aud",
      "iat",
      "exp",
      "auth_time",
      "nonce",
      "email",
      "email_verified",
      "name",
    ],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    authorization_response_iss_parameter_supported: true,
  };
}
