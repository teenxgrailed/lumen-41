import { addCalendarDays, newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";

import {
  CONNECTOR_TOKEN_LIFETIME_DAYS,
  generateConnectorToken,
  hashConnectorToken,
  isConnectorTokenExpired,
} from "./auth-tokens";

const LOG_SOURCE = "personal-tokens";

/** Named personal tokens a person can hold at once (the Default one is extra). */
export const PERSONAL_TOKEN_LIMIT = 25;
export const PERSONAL_TOKEN_NAME_MAX = 60;
/** `lastUsedAt` is written at most this often per token. */
export const PERSONAL_TOKEN_TOUCH_MS = 60 * 1000;

/** The id the list gives the legacy `ConnectorSettings` token. */
export const DEFAULT_TOKEN_ID = "default";
export const DEFAULT_TOKEN_NAME = "Default";

export interface PersonalTokenEntry {
  id: string;
  name: string;
  tokenPreview: string;
  createdAt: string | null;
  lastUsedAt: string | null;
  /** Null: made before expiry existed; it works until it is revoked. */
  expiresAt: string | null;
  expired: boolean;
  /** The token every person had before tokens were named. */
  legacy: boolean;
}

export class PersonalTokenError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

/** A trimmed name of 1 to 60 characters, or a 400. */
export function parseTokenName(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name || name.length > PERSONAL_TOKEN_NAME_MAX) {
    throw new PersonalTokenError(
      400,
      `Name the token with 1 to ${PERSONAL_TOKEN_NAME_MAX} characters.`
    );
  }
  return name;
}

export function personalTokenPreview(token: string) {
  return `${token.slice(0, 10)}...${token.slice(-4)}`;
}

function toEntry(row: {
  id: string;
  name: string;
  tokenPreview: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
}): PersonalTokenEntry {
  return {
    id: row.id,
    name: row.name,
    tokenPreview: row.tokenPreview,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    expired: isConnectorTokenExpired(row.expiresAt),
    legacy: false,
  };
}

/**
 * Every live token of a person: the legacy one first, as "Default", then the
 * named ones, newest first. Revoked tokens are not listed.
 */
export async function listPersonalTokens(
  userId: string
): Promise<PersonalTokenEntry[]> {
  const [legacy, named] = await Promise.all([
    prisma.connectorSettings.findUnique({
      where: { userId },
      select: {
        tokenHash: true,
        tokenPreview: true,
        tokenExpiresAt: true,
        tokenLastUsedAt: true,
        updatedAt: true,
      },
    }),
    prisma.personalApiToken.findMany({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const entries: PersonalTokenEntry[] = [];
  if (legacy?.tokenHash) {
    entries.push({
      id: DEFAULT_TOKEN_ID,
      name: DEFAULT_TOKEN_NAME,
      tokenPreview: legacy.tokenPreview ?? "needt_...",
      createdAt: null,
      lastUsedAt: legacy.tokenLastUsedAt?.toISOString() ?? null,
      expiresAt: legacy.tokenExpiresAt?.toISOString() ?? null,
      expired: isConnectorTokenExpired(legacy.tokenExpiresAt),
      legacy: true,
    });
  }
  return [...entries, ...named.map(toEntry)];
}

/** Makes a named token. The plaintext is returned once; only its sha256 is kept. */
export async function createPersonalToken(userId: string, rawName: unknown) {
  const name = parseTokenName(rawName);
  const active = await prisma.personalApiToken.count({
    where: { userId, revokedAt: null },
  });
  if (active >= PERSONAL_TOKEN_LIMIT) {
    throw new PersonalTokenError(
      409,
      `You can hold ${PERSONAL_TOKEN_LIMIT} tokens at once. Revoke one you no longer use.`
    );
  }
  const token = generateConnectorToken();
  const row = await prisma.personalApiToken.create({
    data: {
      userId,
      name,
      tokenHash: hashConnectorToken(token),
      tokenPreview: personalTokenPreview(token),
      expiresAt: addCalendarDays(newDate(), CONNECTOR_TOKEN_LIFETIME_DAYS),
    },
  });
  return { token, entry: toEntry(row) };
}

/** Renames a named token. The Default token has no name of its own. */
export async function renamePersonalToken(
  userId: string,
  id: string,
  rawName: unknown
) {
  if (id === DEFAULT_TOKEN_ID) {
    throw new PersonalTokenError(400, "The Default token cannot be renamed.");
  }
  const name = parseTokenName(rawName);
  const result = await prisma.personalApiToken.updateMany({
    where: { id, userId, revokedAt: null },
    data: { name },
  });
  if (!result.count) throw new PersonalTokenError(404, "Token not found.");
  const row = await prisma.personalApiToken.findFirst({
    where: { id, userId },
  });
  if (!row) throw new PersonalTokenError(404, "Token not found.");
  return toEntry(row);
}

/** Revokes one token at once; the others keep working. */
export async function revokePersonalToken(userId: string, id: string) {
  if (id === DEFAULT_TOKEN_ID) {
    const result = await prisma.connectorSettings.updateMany({
      where: { userId, tokenHash: { not: null } },
      data: {
        tokenHash: null,
        tokenPreview: null,
        tokenExpiresAt: null,
        tokenLastUsedAt: null,
      },
    });
    if (!result.count) throw new PersonalTokenError(404, "Token not found.");
    return;
  }
  const result = await prisma.personalApiToken.updateMany({
    where: { id, userId, revokedAt: null },
    data: { revokedAt: newDate() },
  });
  if (!result.count) throw new PersonalTokenError(404, "Token not found.");
}

/**
 * Revokes every named token of a person, for the moments the legacy token is
 * revoked too (password reset, "sign out everywhere"). Returned unawaited so it
 * can join a `prisma.$transaction([...])`.
 */
export function revokeNamedPersonalTokens(userId: string) {
  return prisma.personalApiToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: newDate() },
  });
}

/** Who a named token speaks for, or null when it is unknown, revoked or expired. */
export async function resolveNamedPersonalToken(token: string) {
  const row = await prisma.personalApiToken.findUnique({
    where: { tokenHash: hashConnectorToken(token) },
    select: {
      id: true,
      userId: true,
      name: true,
      expiresAt: true,
      revokedAt: true,
      lastUsedAt: true,
    },
  });
  if (!row || row.revokedAt || isConnectorTokenExpired(row.expiresAt)) {
    return null;
  }
  const now = newDate();
  if (
    !row.lastUsedAt ||
    now.getTime() - row.lastUsedAt.getTime() > PERSONAL_TOKEN_TOUCH_MS
  ) {
    await touch(() =>
      prisma.personalApiToken.update({
        where: { id: row.id },
        data: { lastUsedAt: now },
      })
    );
  }
  return { id: row.id, userId: row.userId, name: row.name };
}

/** Records use of the legacy token, at most once a minute. */
export async function touchLegacyToken(
  userId: string,
  lastUsedAt: Date | null | undefined
) {
  const now = newDate();
  if (
    lastUsedAt &&
    now.getTime() - lastUsedAt.getTime() <= PERSONAL_TOKEN_TOUCH_MS
  ) {
    return;
  }
  await touch(() =>
    prisma.connectorSettings.update({
      where: { userId },
      data: { tokenLastUsedAt: now },
    })
  );
}

/** "Last used" is a courtesy: a failed write never fails the call. */
async function touch(write: () => Promise<unknown>) {
  try {
    await write();
  } catch (error) {
    logger.warn(
      "Could not record token use",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
  }
}
