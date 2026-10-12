import type { JWT } from "next-auth/jwt";

import { revokeConnectorTokens } from "@/services/connectors/auth";

import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "SessionVersion";

/**
 * "Sign out of all devices" works by version, not by a session table: every
 * session token carries the `User.sessionVersion` it was issued under, and a
 * token whose version no longer matches the database is treated as signed out.
 *
 * Checking the database on every request would cost a query per request, so
 * a token is re-checked at most once per SESSION_VERSION_RECHECK_MS. That is
 * the bound: after a revoke, another device keeps working for at most this
 * long before its next request is refused.
 */
export const SESSION_VERSION_RECHECK_MS = 60_000;

/** Process-local entries kept for API checks before the map is reset. */
const MAX_CACHED_USERS = 10_000;

export class SessionRevokedError extends Error {
  constructor() {
    super("SESSION_REVOKED");
    this.name = "SessionRevokedError";
  }
}

type SessionState = { isActive: boolean; sessionVersion: number } | null;

type VersionedToken = Pick<JWT, "sub" | "sessionVersion">;

/** Tokens issued before versioning carry no claim; they belong to version 0. */
export function tokenSessionVersion(token: VersionedToken): number {
  return typeof token.sessionVersion === "number" ? token.sessionVersion : 0;
}

export function sessionStateAllows(
  state: SessionState,
  token: VersionedToken
): boolean {
  return Boolean(
    state?.isActive && state.sessionVersion === tokenSessionVersion(token)
  );
}

function readSessionState(userId: string): Promise<SessionState> {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { isActive: true, sessionVersion: true },
  });
}

/**
 * jwt callback, at sign-in: record the version the new token is issued under.
 */
export async function issueSessionVersion(
  token: JWT,
  userId: string,
  nowMs = newDate().getTime()
): Promise<JWT> {
  const state = await readSessionState(userId);
  return {
    ...token,
    sessionVersion: state?.sessionVersion ?? 0,
    sessionVersionCheckedAt: nowMs,
  };
}

/**
 * Reads the state for a check, or undefined when the database could not be
 * reached. A failed read must never sign anyone out: a restart, a full pool
 * (P2024) or a timeout during a deploy would otherwise end every session that
 * happens to be re-checked at that moment.
 */
async function tryReadSessionState(
  userId: string,
  context: string
): Promise<SessionState | undefined> {
  try {
    return await readSessionState(userId);
  } catch (error) {
    await logger.warn(
      "Session version check skipped: database read failed",
      {
        context,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      LOG_SOURCE
    );
    return undefined;
  }
}

/**
 * jwt callback, on every session read: throws SessionRevokedError when the
 * token was revoked. NextAuth answers a throwing jwt callback with an empty
 * session and clears the session cookie, which is what signs the device out.
 * The last check time lives in the token, so the database is read at most
 * once per SESSION_VERSION_RECHECK_MS per session. Only a confirmed mismatch,
 * a deleted user or a deactivated one rejects; when the read fails the token
 * is kept as it is and checked again on the next request.
 */
export async function enforceSessionVersion(
  token: JWT,
  nowMs = newDate().getTime()
): Promise<JWT> {
  if (!token.sub) return token;
  const checkedAt = token.sessionVersionCheckedAt;
  if (
    typeof checkedAt === "number" &&
    nowMs >= checkedAt &&
    nowMs - checkedAt < SESSION_VERSION_RECHECK_MS
  ) {
    return token;
  }
  const state = await tryReadSessionState(token.sub, "jwt");
  if (state === undefined) return token;
  if (!sessionStateAllows(state, token)) throw new SessionRevokedError();
  return {
    ...token,
    sessionVersion: tokenSessionVersion(token),
    sessionVersionCheckedAt: nowMs,
  };
}

/*
 * API routes read the cookie with getToken, which never runs the jwt callback
 * and cannot write the token back, so the recheck interval for them is kept in
 * this process instead. Only a state that allowed a token is cached: a token
 * the cache would refuse is checked against the database first, so a new
 * sign-in after a revoke on another instance is never refused from a stale
 * entry. Each server instance re-reads an allowed user at most once per
 * SESSION_VERSION_RECHECK_MS; a revoke on this instance drops the entry
 * immediately.
 */
const apiCache = new Map<
  string,
  { state: NonNullable<SessionState>; readAt: number }
>();

export async function isApiSessionCurrent(
  token: VersionedToken,
  nowMs = newDate().getTime()
): Promise<boolean> {
  if (!token.sub) return false;
  const cached = apiCache.get(token.sub);
  if (
    cached &&
    nowMs >= cached.readAt &&
    nowMs - cached.readAt < SESSION_VERSION_RECHECK_MS &&
    sessionStateAllows(cached.state, token)
  ) {
    return true;
  }
  const state = await tryReadSessionState(token.sub, "api");
  // Same rule as the jwt callback: an unreachable database is not a revoke.
  if (state === undefined) return true;
  if (!state || !sessionStateAllows(state, token)) {
    apiCache.delete(token.sub);
    return false;
  }
  if (apiCache.size >= MAX_CACHED_USERS) apiCache.clear();
  apiCache.set(token.sub, { state, readAt: nowMs });
  return true;
}

export function forgetSessionState(userId: string) {
  apiCache.delete(userId);
}

/**
 * Everything "sign out of all devices" and a password reset revoke: every
 * session (by version) and the connector token external tools use, which
 * would otherwise keep working with the old credentials. Returned unawaited
 * so the writes can join an array `prisma.$transaction([...])` next to the
 * change that caused them.
 */
export function revokeAllAccess(userId: string) {
  return [bumpSessionVersion(userId), revokeConnectorTokens(userId)] as const;
}

/**
 * The write that revokes every session of a user. Returned unawaited so it can
 * join an array `prisma.$transaction([...])` next to the change that caused it.
 */
export function bumpSessionVersion(userId: string) {
  forgetSessionState(userId);
  return prisma.user.update({
    where: { id: userId },
    data: { sessionVersion: { increment: 1 } },
    select: { sessionVersion: true },
  });
}
