import crypto from "crypto";

import { authSecret } from "@/lib/auth/auth-secret";
import { newDate } from "@/lib/date-utils";
import { PLAN_LIMITS, getPlan } from "@/lib/entitlements";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  decryptOptionalSecret,
  decryptSecret,
  encryptOptionalSecret,
  encryptSecret,
} from "@/lib/security/secret-encryption";

import {
  PinterestApiError,
  type PinterestTokens,
  getPinterestOAuthConfig,
  refreshPinterestTokens,
} from "./client";

const LOG_SOURCE = "PinterestConnection";

/** Refresh the access token when it has less than this left. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/* ---------- plan ---------- */

export class PinterestPlanError extends Error {
  constructor() {
    super("Importing from Pinterest is part of Pro.");
    this.name = "PinterestPlanError";
  }
}

/**
 * Pinterest rides the same entitlement as unlimited moodboards ("Unlimited
 * moodboards: as many boards as you like, and Pinterest" on the plan card), so
 * it reads the existing plan limit instead of adding a gate.
 */
export async function hasPinterestPlan(userId: string): Promise<boolean> {
  const plan = await getPlan(userId);
  return PLAN_LIMITS[plan].boards === null;
}

export async function assertPinterestPlan(userId: string) {
  if (!(await hasPinterestPlan(userId))) throw new PinterestPlanError();
}

/* ---------- OAuth state ---------- */

export const PINTEREST_STATE_COOKIE = "needt_pinterest_oauth";
export const PINTEREST_STATE_TTL_SECONDS = 10 * 60;

interface StatePayload {
  n: string; // nonce, also held in an httpOnly cookie
  e: number; // expiry, epoch ms
  b?: string; // moodboard to come back to
}

function sign(userId: string, payload: string) {
  return crypto
    .createHmac("sha256", authSecret())
    .update(`pinterest-oauth:${userId}:${payload}`)
    .digest("base64url");
}

/** State signed for the user and paired with a nonce cookie (as imports do). */
export function createPinterestState(userId: string, moodboardId?: string) {
  const nonce = crypto.randomBytes(16).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      n: nonce,
      e: newDate().getTime() + PINTEREST_STATE_TTL_SECONDS * 1000,
      ...(moodboardId ? { b: moodboardId } : {}),
    } satisfies StatePayload)
  ).toString("base64url");
  return { state: `${payload}.${sign(userId, payload)}`, nonce };
}

export function verifyPinterestState(
  state: string | null,
  userId: string,
  cookieNonce: string | undefined
): { moodboardId: string | null } | null {
  if (!state || !cookieNonce) return null;
  const [payload, signature] = state.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(userId, payload));
  const given = Buffer.from(signature);
  if (
    expected.length !== given.length ||
    !crypto.timingSafeEqual(expected, given)
  )
    return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    ) as Partial<StatePayload>;
    if (
      typeof parsed.n !== "string" ||
      typeof parsed.e !== "number" ||
      parsed.e < newDate().getTime() ||
      parsed.n !== cookieNonce
    )
      return null;
    const b = typeof parsed.b === "string" ? parsed.b : null;
    return { moodboardId: b && /^[A-Za-z0-9_-]{1,64}$/.test(b) ? b : null };
  } catch {
    return null;
  }
}

/* ---------- the stored grant ---------- */

export async function saveConnection(
  userId: string,
  tokens: PinterestTokens,
  username: string | null
) {
  const data = {
    username,
    accessToken: encryptSecret(tokens.accessToken),
    refreshToken: encryptOptionalSecret(tokens.refreshToken),
    accessExpiresAt: tokens.accessExpiresAt,
    refreshExpiresAt: tokens.refreshExpiresAt,
    scope: tokens.scope,
    status: "CONNECTED",
  };
  await prisma.pinterestConnection.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
  // A reconnect revives the boards that were waiting on it.
  await prisma.moodboard.updateMany({
    where: { pinterestConnectedById: userId, pinterestStatus: "lost" },
    data: { pinterestStatus: "ok" },
  });
}

export function getConnection(userId: string) {
  return prisma.pinterestConnection.findUnique({ where: { userId } });
}

/** Removes the grant and stops every board's sync that used it. */
export async function deleteConnection(userId: string) {
  await prisma.$transaction([
    prisma.moodboard.updateMany({
      where: { pinterestConnectedById: userId },
      data: { pinterestSync: false },
    }),
    prisma.pinterestConnection.deleteMany({ where: { userId } }),
  ]);
}

/** Pinterest refused the tokens: the grant waits for a reconnect. */
export async function markNeedsReconnect(userId: string) {
  await prisma.pinterestConnection.updateMany({
    where: { userId },
    data: { status: "ERROR" },
  });
  await prisma.moodboard.updateMany({
    where: { pinterestConnectedById: userId, pinterestBoardId: { not: null } },
    data: { pinterestStatus: "lost" },
  });
}

/**
 * A usable access token for the person: refreshed when it is about to end.
 * Pinterest turning the tokens down marks the connection as needing a
 * reconnect (sync stays off until then) and throws `unauthorized`.
 */
export async function accessTokenFor(userId: string): Promise<string> {
  const row = await getConnection(userId);
  if (!row)
    throw new PinterestApiError("unauthorized", "Connect Pinterest first.");
  if (row.status !== "CONNECTED")
    throw new PinterestApiError(
      "unauthorized",
      "Pinterest access ended. Connect again."
    );
  const now = newDate().getTime();
  if (row.accessExpiresAt.getTime() - now > REFRESH_MARGIN_MS)
    return decryptSecret(row.accessToken);
  const refresh = decryptOptionalSecret(row.refreshToken);
  const config = getPinterestOAuthConfig();
  if (
    !refresh ||
    !config ||
    (row.refreshExpiresAt && row.refreshExpiresAt.getTime() < now)
  ) {
    await markNeedsReconnect(userId);
    throw new PinterestApiError(
      "unauthorized",
      "Pinterest access ended. Connect again."
    );
  }
  try {
    const tokens = await refreshPinterestTokens(config, refresh);
    await prisma.pinterestConnection.update({
      where: { userId },
      data: {
        accessToken: encryptSecret(tokens.accessToken),
        refreshToken: encryptOptionalSecret(tokens.refreshToken ?? refresh),
        accessExpiresAt: tokens.accessExpiresAt,
        refreshExpiresAt: tokens.refreshExpiresAt ?? row.refreshExpiresAt,
        scope: tokens.scope ?? row.scope,
      },
    });
    return tokens.accessToken;
  } catch (error) {
    if (error instanceof PinterestApiError && error.code === "unauthorized") {
      await markNeedsReconnect(userId);
    } else {
      await logger.warn(
        "Pinterest token refresh failed",
        { error: error instanceof Error ? error.message : String(error) },
        LOG_SOURCE
      );
    }
    throw error;
  }
}

/** Runs `fn` with a token; a 401 from Pinterest marks the grant for reconnect. */
export async function withPinterest<T>(
  userId: string,
  fn: (token: string) => Promise<T>
): Promise<T> {
  const token = await accessTokenFor(userId);
  try {
    return await fn(token);
  } catch (error) {
    if (error instanceof PinterestApiError && error.code === "unauthorized")
      await markNeedsReconnect(userId);
    throw error;
  }
}
