import crypto from "crypto";

import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { oauthIssuer } from "@/lib/mcp-config";
import { prisma } from "@/lib/prisma";

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

let cache: { pem: string; key: SigningKey | null } | null = null;

/**
 * The key id_tokens are signed with: env `OIDC_SIGNING_KEY`, a PKCS#8 PEM of
 * an RSA key of at least 2048 bits. null when it is missing or unusable —
 * OpenID Connect then fails with `server_error` and nothing else is affected.
 * Parsed once per distinct value. The key itself is never logged.
 */
export async function loadSigningKey(): Promise<SigningKey | null> {
  const raw = process.env.OIDC_SIGNING_KEY?.trim();
  if (!raw) return null;
  if (cache?.pem === raw) return cache.key;
  let key: SigningKey | null = null;
  try {
    const privateKey = crypto.createPrivateKey(normalizePem(raw));
    const bits = privateKey.asymmetricKeyDetails?.modulusLength ?? 0;
    if (privateKey.asymmetricKeyType !== "rsa" || bits < 2048) {
      await logger.error(
        "OIDC_SIGNING_KEY is not an RSA key of at least 2048 bits",
        { type: privateKey.asymmetricKeyType ?? "unknown", bits },
        LOG_SOURCE
      );
    } else {
      const { n, e } = crypto
        .createPublicKey(privateKey)
        .export({ format: "jwk" });
      if (n && e) {
        const kid = thumbprint({ n, e });
        key = {
          privateKey,
          kid,
          publicJwk: { kty: "RSA", n, e, kid, alg: "RS256", use: "sig" },
        };
      }
    }
  } catch {
    await logger.error("OIDC_SIGNING_KEY could not be read", {}, LOG_SOURCE);
  }
  cache = { pem: raw, key };
  return key;
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
