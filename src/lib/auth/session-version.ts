import type { JWT } from "next-auth/jwt";

import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

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
 * jwt callback, on every session read: throws SessionRevokedError when the
 * token was revoked. NextAuth answers a throwing jwt callback with an empty
 * session and clears the session cookie, which is what signs the device out.
 * The last check time lives in the token, so the database is read at most
 * once per SESSION_VERSION_RECHECK_MS per session.
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
  const state = await readSessionState(token.sub);
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
 * this process instead. Each server instance re-reads a user at most once per
 * SESSION_VERSION_RECHECK_MS; a revoke on this instance drops the entry
 * immediately.
 */
const apiCache = new Map<string, { state: SessionState; readAt: number }>();

export async function isApiSessionCurrent(
  token: VersionedToken,
  nowMs = newDate().getTime()
): Promise<boolean> {
  if (!token.sub) return false;
  const cached = apiCache.get(token.sub);
  if (
    cached &&
    nowMs >= cached.readAt &&
    nowMs - cached.readAt < SESSION_VERSION_RECHECK_MS
  ) {
    return sessionStateAllows(cached.state, token);
  }
  const state = await readSessionState(token.sub);
  if (apiCache.size >= MAX_CACHED_USERS) apiCache.clear();
  apiCache.set(token.sub, { state, readAt: nowMs });
  return sessionStateAllows(state, token);
}

export function forgetSessionState(userId: string) {
  apiCache.delete(userId);
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
