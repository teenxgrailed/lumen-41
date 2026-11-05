import { AIProvider } from "@prisma/client";
import crypto from "crypto";

import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import { decryptSecret, encryptSecret } from "../encryption";
import { createPkceChallenge } from "../oauth";
import {
  CHATGPT_PLAN_AUTHORIZE_URL,
  CHATGPT_PLAN_DISCOVERY_URL,
  CHATGPT_PLAN_ISSUER,
  CHATGPT_PLAN_RESOURCE,
  CHATGPT_PLAN_SCOPES,
  CHATGPT_PLAN_TOKEN_URL,
  CHATGPT_PLAN_USE_SCOPE,
  type ChatGptPlanConfig,
  getChatGptPlanConfig,
} from "./config";
import { ChatGptPlanError, classifyTokenError } from "./errors";

const LOG_SOURCE = "ai-chatgpt-plan-oauth";
/** Access tokens last an hour; refresh a minute early. */
const REFRESH_SKEW_MS = 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;
const JWKS_TTL_MS = 10 * 60 * 1000;
/** An unknown `kid` may mean a rotation; refetch, but not more often than this. */
const JWKS_REFETCH_MIN_MS = 60 * 1000;
/** The refresh transaction holds one request (REQUEST_TIMEOUT_MS) plus writes. */
const REFRESH_TX_TIMEOUT_MS = REQUEST_TIMEOUT_MS + 10_000;
/** Waiting for another process's refresh: short polls, not one long lock wait. */
const LOCK_RETRY_MS = 250;
const LOCK_ATTEMPTS = 60;

/**
 * The nonce is derived from the one-use `state` instead of stored, so the
 * AIOAuthState row needs no extra column. `state` is 32 random bytes the
 * browser carries; the nonce is its SHA-256, so a guess of one is no help
 * with the other.
 */
export function nonceFromState(state: string): string {
  return crypto
    .createHash("sha256")
    .update(`nonce:${state}`)
    .digest("base64url");
}

export function buildChatGptPlanAuthorizationUrl(input: {
  config: ChatGptPlanConfig;
  redirectUri: string;
  state: string;
  codeVerifier: string;
}): string {
  const url = new URL(CHATGPT_PLAN_AUTHORIZE_URL);
  url.searchParams.set("client_id", input.config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", CHATGPT_PLAN_SCOPES.join(" "));
  url.searchParams.set("resource", CHATGPT_PLAN_RESOURCE);
  url.searchParams.set("state", input.state);
  url.searchParams.set("nonce", nonceFromState(input.state));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set(
    "code_challenge",
    createPkceChallenge(input.codeVerifier)
  );
  return url.toString();
}

export interface ChatGptPlanTokens {
  accessToken: string;
  refreshToken: string | null;
  scope: string;
  expiresAt: Date;
  idToken: string | null;
}

export function scopesOf(scope: string | null | undefined): string[] {
  return (scope ?? "").split(/\s+/).filter(Boolean);
}

export function hasPlanScope(scope: string | null | undefined): boolean {
  return scopesOf(scope).includes(CHATGPT_PLAN_USE_SCOPE);
}

/** A secret that cannot be decrypted (key rotated, row damaged) reads as absent. */
export function safeDecrypt(value: string | null | undefined): string | null {
  try {
    return decryptSecret(value);
  } catch {
    return null;
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * The token endpoint's answer. A grant without `scope` keeps the previous one
 * (OAuth may omit it on refresh when nothing changed), so the caller passes it.
 */
export function parseTokenResponse(
  body: unknown,
  previousScope?: string | null
): ChatGptPlanTokens {
  const data = record(body);
  if (!data || typeof data.access_token !== "string" || !data.access_token) {
    throw new ChatGptPlanError("other", "ChatGPT returned no access token");
  }
  const scope =
    typeof data.scope === "string" && data.scope
      ? data.scope
      : (previousScope ?? "");
  const expiresIn = Number(data.expires_in);
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new ChatGptPlanError("other", "ChatGPT returned no token lifetime");
  }
  const refreshToken =
    typeof data.refresh_token === "string" && data.refresh_token
      ? data.refresh_token
      : null;
  if (scopesOf(scope).includes("offline_access") && !refreshToken) {
    throw new ChatGptPlanError("other", "ChatGPT returned no refresh token");
  }
  return {
    accessToken: data.access_token,
    refreshToken,
    scope,
    expiresAt: newDate(newDate().getTime() + expiresIn * 1000),
    idToken: typeof data.id_token === "string" ? data.id_token : null,
  };
}

async function tokenRequest(
  config: ChatGptPlanConfig,
  params: URLSearchParams,
  previousScope?: string | null
): Promise<ChatGptPlanTokens> {
  params.set("client_id", config.clientId);
  params.set("resource", CHATGPT_PLAN_RESOURCE);
  if (config.clientSecret) params.set("client_secret", config.clientSecret);

  let response: Response;
  try {
    response = await fetch(CHATGPT_PLAN_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: params.toString(),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new ChatGptPlanError("unavailable", "Could not reach ChatGPT");
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) throw classifyTokenError(body, response.status);
  return parseTokenResponse(body, previousScope);
}

export function exchangeChatGptPlanCode(input: {
  config: ChatGptPlanConfig;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}) {
  return tokenRequest(
    input.config,
    new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      code_verifier: input.codeVerifier,
      redirect_uri: input.redirectUri,
    })
  );
}

export function refreshChatGptPlanTokens(
  config: ChatGptPlanConfig,
  refreshToken: string,
  previousScope: string | null
) {
  // `scope` is omitted on purpose: that keeps the grant as it was.
  return tokenRequest(
    config,
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    previousScope
  );
}

// ---------------------------------------------------------------------------
// ID token: signature, issuer, audience, expiry and nonce (docs: "Validate the
// ID token"). The email in it is only a label; `sub` is the account.

interface Jwk {
  kid?: string;
  kty?: string;
  [key: string]: unknown;
}
let jwksCache: { keys: Jwk[]; at: number } | null = null;
let jwksFetchedAt = 0;

async function fetchJwks(): Promise<Jwk[]> {
  const discovery = record(
    await (
      await fetch(CHATGPT_PLAN_DISCOVERY_URL, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    )
      .json()
      .catch(() => null)
  );
  const jwksUri =
    typeof discovery?.jwks_uri === "string" ? discovery.jwks_uri : "";
  if (
    discovery?.issuer !== CHATGPT_PLAN_ISSUER ||
    !jwksUri.startsWith(`${CHATGPT_PLAN_ISSUER}/`)
  ) {
    throw new ChatGptPlanError(
      "unavailable",
      "ChatGPT sign-in could not be verified"
    );
  }
  const jwks = record(
    await (
      await fetch(jwksUri, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    )
      .json()
      .catch(() => null)
  );
  if (!Array.isArray(jwks?.keys)) {
    throw new ChatGptPlanError(
      "unavailable",
      "ChatGPT sign-in could not be verified"
    );
  }
  jwksFetchedAt = newDate().getTime();
  jwksCache = { keys: jwks.keys as Jwk[], at: jwksFetchedAt };
  return jwksCache.keys;
}

async function loadJwks(): Promise<{ keys: Jwk[]; cached: boolean }> {
  if (jwksCache && newDate().getTime() - jwksCache.at < JWKS_TTL_MS) {
    return { keys: jwksCache.keys, cached: true };
  }
  return { keys: await fetchJwks(), cached: false };
}

/** For tests. */
export function resetJwksCache() {
  jwksCache = null;
  jwksFetchedAt = 0;
}

function decodePart(part: string): Record<string, unknown> | null {
  try {
    return record(JSON.parse(Buffer.from(part, "base64url").toString("utf8")));
  } catch {
    return null;
  }
}

export interface VerifiedIdentity {
  subject: string;
  email: string | null;
}

export async function verifyChatGptIdToken(
  idToken: string,
  expected: { clientId: string; nonce: string },
  keys?: Jwk[]
): Promise<VerifiedIdentity> {
  const invalid = () =>
    new ChatGptPlanError("other", "The ChatGPT identity could not be verified");
  const parts = idToken.split(".");
  if (parts.length !== 3) throw invalid();
  const header = decodePart(parts[0]);
  const payload = decodePart(parts[1]);
  if (!header || !payload || header.alg !== "RS256") throw invalid();

  const loaded = keys ? { keys, cached: false } : await loadJwks();
  let jwk = loaded.keys.find((key) => key.kid === header.kid);
  if (
    !jwk &&
    loaded.cached &&
    newDate().getTime() - jwksFetchedAt >= JWKS_REFETCH_MIN_MS
  ) {
    // A key we have not seen in the cache: OpenAI may have rotated. Look once
    // more, and not again for a minute, so a forged `kid` cannot make us poll.
    jwk = (await fetchJwks()).find((key) => key.kid === header.kid);
  }
  if (!jwk || jwk.kty !== "RSA") throw invalid();
  let valid = false;
  try {
    valid = crypto.verify(
      "RSA-SHA256",
      Buffer.from(`${parts[0]}.${parts[1]}`),
      crypto.createPublicKey({ key: jwk as crypto.JsonWebKey, format: "jwk" }),
      Buffer.from(parts[2], "base64url")
    );
  } catch {
    valid = false;
  }
  if (!valid) throw invalid();

  const aud = payload.aud;
  const audiences = Array.isArray(aud) ? aud : [aud];
  const exp = Number(payload.exp);
  if (
    payload.iss !== CHATGPT_PLAN_ISSUER ||
    !audiences.includes(expected.clientId) ||
    (audiences.length > 1 && payload.azp !== expected.clientId) ||
    !Number.isFinite(exp) ||
    exp * 1000 < newDate().getTime() - 5_000 ||
    payload.nonce !== expected.nonce ||
    typeof payload.sub !== "string" ||
    !payload.sub
  ) {
    throw invalid();
  }
  return {
    subject: payload.sub,
    email: typeof payload.email === "string" ? payload.email : null,
  };
}

// ---------------------------------------------------------------------------
// Using the stored connection.

export type AccessTokenResult =
  | { ok: true; accessToken: string; expiresAt: Date | null }
  | { ok: false; reason: "not_connected" | "revoked" | "unavailable" };

const where = (userId: string) => ({
  userId_provider: { userId, provider: AIProvider.CHATGPT_PLAN },
});

function fresh(expiresAt: Date | null) {
  return (
    !expiresAt || expiresAt.getTime() > newDate().getTime() + REFRESH_SKEW_MS
  );
}

/**
 * A usable access token for this person, refreshed when it is near expiry.
 *
 * Refresh tokens rotate ("serialize refreshes for the same session so two
 * processes do not race a rotating token"), so the refresh runs inside a
 * transaction that holds a Postgres advisory lock for this person, and the row
 * is read again under the lock: the loser of a race finds the winner's token
 * and uses it. A dead refresh token (`invalid_grant`, `refresh_token_*`)
 * deletes the connection so the person is asked to sign in again; a network or
 * 5xx failure keeps it.
 *
 * `force` refreshes even if the token looks fresh (a 401 from the Responses
 * API).
 */
export async function getChatGptPlanAccessToken(
  userId: string,
  options: { force?: boolean } = {}
): Promise<AccessTokenResult> {
  const config = getChatGptPlanConfig();
  if (!config) return { ok: false, reason: "not_connected" };

  const connection = await prisma.aIOAuthConnection.findUnique({
    where: where(userId),
  });
  if (!connection) return { ok: false, reason: "not_connected" };
  if (!options.force && fresh(connection.expiresAt)) {
    const accessToken = safeDecrypt(connection.encryptedAccessToken);
    if (accessToken) {
      return { ok: true, accessToken, expiresAt: connection.expiresAt };
    }
  }

  type Rotated = {
    id: string;
    previousRefresh: string;
    tokens: ChatGptPlanTokens;
  };
  for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
    // Set once OpenAI has rotated the token, so a failed commit can still save it.
    const rotated: { value: Rotated | null } = { value: null };
    try {
      const result = await prisma.$transaction(
        async (tx) => {
          // Try, never wait: a waiter would burn this transaction's timeout
          // and hold a pool connection. The caller polls instead.
          const [lock] = await tx.$queryRaw<
            Array<{ locked: boolean }>
          >`SELECT pg_try_advisory_xact_lock(hashtext(${`chatgpt-plan:${userId}`})) AS locked`;
          if (!lock?.locked) return null;
          const current = await tx.aIOAuthConnection.findUnique({
            where: where(userId),
          });
          if (!current) return { ok: false, reason: "not_connected" } as const;

          const staleToken = safeDecrypt(current.encryptedAccessToken);
          const moved =
            current.encryptedRefreshToken !== connection.encryptedRefreshToken;
          if (
            staleToken &&
            (moved || (!options.force && fresh(current.expiresAt)))
          ) {
            // Someone else refreshed while we waited for the lock.
            return {
              ok: true,
              accessToken: staleToken,
              expiresAt: current.expiresAt,
            } as const;
          }

          const refreshToken = safeDecrypt(current.encryptedRefreshToken);
          if (!refreshToken || !current.encryptedRefreshToken) {
            await tx.aIOAuthConnection.delete({ where: { id: current.id } });
            return { ok: false, reason: "revoked" } as const;
          }
          try {
            const tokens = await refreshChatGptPlanTokens(
              config,
              refreshToken,
              current.scope
            );
            if (!hasPlanScope(tokens.scope)) {
              // Never remember tokens without the plan scope, even if the
              // delete below fails and the outer catch runs.
              await tx.aIOAuthConnection.delete({ where: { id: current.id } });
              return { ok: false, reason: "revoked" } as const;
            }
            rotated.value = {
              id: current.id,
              previousRefresh: current.encryptedRefreshToken,
              tokens,
            };
            await tx.aIOAuthConnection.update({
              where: { id: current.id },
              data: persistedTokens(tokens, current.encryptedRefreshToken),
            });
            return {
              ok: true,
              accessToken: tokens.accessToken,
              expiresAt: tokens.expiresAt,
            } as const;
          } catch (error) {
            if (error instanceof ChatGptPlanError && error.kind === "revoked") {
              await tx.aIOAuthConnection.delete({ where: { id: current.id } });
              return { ok: false, reason: "revoked" } as const;
            }
            throw error;
          }
        },
        { timeout: REFRESH_TX_TIMEOUT_MS, maxWait: 5_000 }
      );
      if (result) return result;
    } catch (error) {
      if (rotated.value) return persistRotatedTokens(rotated.value, error);
      logger.warn(
        "ChatGPT plan token refresh failed; credentials kept",
        { error: error instanceof Error ? error.message : String(error) },
        LOG_SOURCE
      );
      return { ok: false, reason: "unavailable" };
    }
    await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_MS));
  }
  logger.warn(
    "ChatGPT plan token refresh timed out waiting for another refresh",
    {},
    LOG_SOURCE
  );
  return { ok: false, reason: "unavailable" };
}

function persistedTokens(tokens: ChatGptPlanTokens, previousRefresh: string) {
  return {
    encryptedAccessToken: encryptSecret(tokens.accessToken),
    // The replacement refresh token is the only valid one now.
    encryptedRefreshToken: tokens.refreshToken
      ? encryptSecret(tokens.refreshToken)
      : previousRefresh,
    scope: tokens.scope,
    expiresAt: tokens.expiresAt,
  };
}

/**
 * OpenAI already rotated the refresh token but the transaction did not commit.
 * The old refresh token is dead, so losing the new one would end the
 * connection: write it once more, outside the transaction, only if the row
 * still holds the token we rotated away from.
 */
async function persistRotatedTokens(
  rotated: {
    id: string;
    previousRefresh: string;
    tokens: ChatGptPlanTokens;
  },
  cause: unknown
): Promise<AccessTokenResult> {
  const { tokens } = rotated;
  try {
    await prisma.aIOAuthConnection.updateMany({
      where: { id: rotated.id, encryptedRefreshToken: rotated.previousRefresh },
      data: persistedTokens(tokens, rotated.previousRefresh),
    });
  } catch (error) {
    logger.error(
      "ChatGPT plan refreshed tokens could not be saved; the connection will need to be renewed",
      {
        commitError: cause instanceof Error ? cause.message : String(cause),
        retryError: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
  }
  // The new access token is good for its hour either way.
  return {
    ok: true,
    accessToken: tokens.accessToken,
    expiresAt: tokens.expiresAt,
  };
}

/**
 * Ends the renewable session at OpenAI (revocation endpoint from discovery,
 * form-encoded refresh token, HTTP 200 on success). Returns whether OpenAI
 * confirmed it; the caller deletes the local copy either way.
 */
export async function revokeChatGptPlanSession(
  config: ChatGptPlanConfig,
  refreshToken: string
): Promise<boolean> {
  try {
    const discovery = record(
      await (
        await fetch(CHATGPT_PLAN_DISCOVERY_URL, {
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
      )
        .json()
        .catch(() => null)
    );
    const endpoint =
      typeof discovery?.revocation_endpoint === "string"
        ? discovery.revocation_endpoint
        : "";
    if (!endpoint.startsWith(`${CHATGPT_PLAN_ISSUER}/`)) return false;
    const body = new URLSearchParams({
      token: refreshToken,
      token_type_hint: "refresh_token",
      client_id: config.clientId,
    });
    if (config.clientSecret) body.set("client_secret", config.clientSecret);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.status === 200) return true;
      if (response.status < 500) return false;
    }
  } catch {
    // Reported as unconfirmed below.
  }
  return false;
}
