import { createHash, randomBytes } from "crypto";

import { newDate } from "@/lib/date-utils";
import { prisma } from "@/lib/prisma";

/** A link code works for this long after it is made. */
export const LINK_CODE_TTL_MS = 10 * 60 * 1000;

/** Handled update ids are kept this long for dedupe. */
const UPDATE_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export interface ActiveLink {
  id: string;
  userId: string;
  channel: string;
  externalChatId: string;
}

const hashCode = (code: string) =>
  createHash("sha256").update(code.trim()).digest("hex");

/** A fresh single-use code, valid for 10 minutes. Older unused ones stop working. */
export async function createLinkCode(
  userId: string,
  channel: string,
  now: Date = newDate()
): Promise<{ code: string; expiresAt: Date }> {
  const code = randomBytes(12).toString("base64url");
  const expiresAt = new Date(now.getTime() + LINK_CODE_TTL_MS);
  await prisma.channelLinkCode.updateMany({
    where: { userId, channel, usedAt: null },
    data: { usedAt: now },
  });
  await prisma.channelLinkCode.create({
    data: { userId, channel, codeHash: hashCode(code), expiresAt },
  });
  return { code, expiresAt };
}

export type RedeemResult =
  | { status: "linked"; userId: string }
  | { status: "already"; userId: string }
  | { status: "invalid" }
  /** The chat is linked to a different account. */
  | { status: "taken" };

/**
 * Links a chat with a code. An expired, used or unknown code links nothing. A
 * chat that already belongs to another account is refused, so one messenger
 * account never serves two people.
 */
export async function redeemLinkCode(
  channel: string,
  code: string,
  externalChatId: string,
  now: Date = newDate()
): Promise<RedeemResult> {
  // One transaction: check, claim the code, unlink the person's other chat and
  // link this one, so a failure half way leaves nothing changed.
  return prisma.$transaction(async (tx) => {
    const row = await tx.channelLinkCode.findUnique({
      where: { codeHash: hashCode(code) },
    });
    if (
      !row ||
      row.channel !== channel ||
      row.usedAt !== null ||
      row.expiresAt.getTime() <= now.getTime()
    ) {
      return { status: "invalid" } as const;
    }

    const existing = await tx.channelLink.findUnique({
      where: { channel_externalChatId: { channel, externalChatId } },
    });
    if (
      existing &&
      existing.unlinkedAt === null &&
      existing.userId !== row.userId
    ) {
      return { status: "taken" } as const;
    }

    // Single use: only the request that flips usedAt goes on.
    const claimed = await tx.channelLinkCode.updateMany({
      where: { id: row.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) return { status: "invalid" } as const;

    if (existing && existing.unlinkedAt === null) {
      return { status: "already", userId: row.userId } as const;
    }

    // One active chat per person and channel: a newer link replaces the older.
    await tx.channelLink.updateMany({
      where: { userId: row.userId, channel, unlinkedAt: null },
      data: { unlinkedAt: now },
    });
    await tx.channelLink.upsert({
      where: { channel_externalChatId: { channel, externalChatId } },
      create: { userId: row.userId, channel, externalChatId, linkedAt: now },
      update: { userId: row.userId, linkedAt: now, unlinkedAt: null },
    });
    return { status: "linked", userId: row.userId } as const;
  });
}

export async function findActiveLink(
  channel: string,
  externalChatId: string
): Promise<ActiveLink | null> {
  const row = await prisma.channelLink.findFirst({
    where: { channel, externalChatId, unlinkedAt: null },
    select: { id: true, userId: true, channel: true, externalChatId: true },
  });
  return row ?? null;
}

export async function listActiveLinks(
  userId: string,
  channel?: string
): Promise<ActiveLink[]> {
  return prisma.channelLink.findMany({
    where: { userId, unlinkedAt: null, ...(channel ? { channel } : {}) },
    select: { id: true, userId: true, channel: true, externalChatId: true },
  });
}

/** Unlinks every chat of a person on a channel. Returns how many were active. */
export async function unlinkUser(
  userId: string,
  channel: string,
  now: Date = newDate()
): Promise<number> {
  const { count } = await prisma.channelLink.updateMany({
    where: { userId, channel, unlinkedAt: null },
    data: { unlinkedAt: now },
  });
  return count;
}

/** Unlinks one chat, from the messenger side. */
export async function unlinkChat(
  channel: string,
  externalChatId: string,
  now: Date = newDate()
): Promise<boolean> {
  const { count } = await prisma.channelLink.updateMany({
    where: { channel, externalChatId, unlinkedAt: null },
    data: { unlinkedAt: now },
  });
  return count > 0;
}

/**
 * Claims an update id. True for the first delivery, false for a repeat, decided
 * by the unique (channel, update id) index so parallel deliveries cannot both win.
 */
export async function claimUpdate(
  channel: string,
  externalUpdateId: string
): Promise<boolean> {
  try {
    await prisma.channelUpdate.create({
      data: { channel, externalUpdateId },
    });
    return true;
  } catch (error) {
    if ((error as { code?: string } | null)?.code === "P2002") return false;
    throw error;
  }
}

/** Daily cleanup: forgets update ids and expired link codes past retention. */
export async function cleanupChannelRows(
  now: Date = newDate()
): Promise<{ updates: number; codes: number }> {
  const updates = await prisma.channelUpdate.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - UPDATE_RETENTION_MS) } },
  });
  const codes = await prisma.channelLinkCode.deleteMany({
    where: { expiresAt: { lt: new Date(now.getTime() - UPDATE_RETENTION_MS) } },
  });
  return { updates: updates.count, codes: codes.count };
}
