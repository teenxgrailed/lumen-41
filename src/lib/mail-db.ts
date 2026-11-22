import { revokeGoogleConnectionOnDisconnect } from "@/services/account/account-external-access";
import { MailAccountStatus, MailProvider, Prisma } from "@prisma/client";

import { publicMailAccountSelect } from "@/lib/api/public-records";
import { newDate } from "@/lib/date-utils";
import { logger } from "@/lib/logger";
import { MailMessageSyncInput } from "@/lib/mail/types";
import { prisma } from "@/lib/prisma";

const LOG_SOURCE = "MailDb";
const MAIL_RETENTION_DAYS = 90;
const MAIL_MESSAGE_CAP = 2_000; //todo make this configurable per account.

export async function listMailAccounts(userId: string) {
  const now = newDate();
  return prisma.mailAccount.findMany({
    where: { userId },
    orderBy: [{ status: "asc" }, { address: "asc" }],
    select: {
      ...publicMailAccountSelect,
      _count: {
        select: {
          messages: {
            where: {
              isRead: false,
              isArchived: false,
              OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }],
            },
          },
        },
      },
    },
  });
}

export async function getMailAccountForSync(accountId: string) {
  return prisma.mailAccount.findUnique({
    where: { id: accountId },
    include: { connection: true },
  });
}

export async function listActiveMailAccountIds(): Promise<string[]> {
  const accounts = await prisma.mailAccount.findMany({
    where: { status: MailAccountStatus.ACTIVE },
    select: { id: true },
  });
  return accounts.map((account) => account.id);
}

export async function createOAuthMailAccount(options: {
  userId: string;
  provider: Extract<MailProvider, "GMAIL" | "OUTLOOK">;
  address: string;
  connectionRef: string;
}) {
  const where = {
    userId_provider_address: {
      userId: options.userId,
      provider: options.provider,
      address: options.address,
    },
  };
  const previous = await prisma.mailAccount.findUnique({
    where,
    select: { connectionRef: true },
  });
  const account = await prisma.mailAccount.upsert({
    where,
    update: {
      connectionRef: options.connectionRef,
      status: MailAccountStatus.ACTIVE,
      syncPausedAt: null,
      syncError: null,
    },
    create: options,
  });
  if (
    options.provider === "GMAIL" &&
    previous?.connectionRef &&
    previous.connectionRef !== options.connectionRef
  ) {
    await retireReplacedGoogleConnection(
      options.userId,
      account.id,
      previous.connectionRef
    );
  }
  return account;
}

/**
 * A reconnected Gmail mailbox can land on a different connection row (the
 * mail Google client issues its own, the old one came from the main client).
 * The old row is revoked and deleted once nothing else uses it; a calendar
 * feed, task provider or another mailbox keeps it alive. Never throws: the
 * reconnect has already succeeded.
 */
async function retireReplacedGoogleConnection(
  userId: string,
  mailAccountId: string,
  oldConnectionRef: string
) {
  try {
    const [calendars, otherMailboxes, taskProviders] = await Promise.all([
      prisma.calendarFeed.count({ where: { accountId: oldConnectionRef } }),
      prisma.mailAccount.count({
        where: { connectionRef: oldConnectionRef, NOT: { id: mailAccountId } },
      }),
      prisma.taskProvider.count({ where: { accountId: oldConnectionRef } }),
    ]);
    if (calendars > 0 || otherMailboxes > 0 || taskProviders > 0) return;
    await revokeGoogleConnectionOnDisconnect(userId, oldConnectionRef);
    await prisma.connectedAccount.deleteMany({
      where: { id: oldConnectionRef, userId },
    });
  } catch (error) {
    await logger.warn(
      "Could not retire the replaced Google connection after reconnect",
      {
        mailAccountId,
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
  }
}

export async function listMailFocusedSplits(userId: string) {
  return prisma.mailFocusedSplit.findMany({
    where: { userId },
    orderBy: [{ position: "asc" }, { name: "asc" }, { id: "asc" }],
  });
}

export async function createMailFocusedSplit(options: {
  userId: string;
  name: string;
  senderAddress: string;
}) {
  const lastSplit = await prisma.mailFocusedSplit.findFirst({
    where: { userId: options.userId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  return prisma.mailFocusedSplit.create({
    data: {
      ...options,
      senderAddress: options.senderAddress.toLowerCase(),
      position: (lastSplit?.position ?? -1) + 1,
    },
  });
}

export async function deleteMailFocusedSplit(userId: string, splitId: string) {
  return prisma.mailFocusedSplit.deleteMany({
    where: { id: splitId, userId },
  });
}

export async function persistMailMessages(options: {
  accountId: string;
  messages: MailMessageSyncInput[];
  deletedExternalIds?: string[];
  cursor?: string | null;
}) {
  const cutoff = newDate();
  cutoff.setDate(cutoff.getDate() - MAIL_RETENTION_DAYS);

  await prisma.$transaction(
    async (tx) => {
      if (options.deletedExternalIds?.length) {
        await tx.mailMessage.deleteMany({
          where: {
            accountId: options.accountId,
            externalId: { in: options.deletedExternalIds },
          },
        });
      }
      for (const message of options.messages) {
        // Read and archived state belong to Needt: mail is read-only, so the
        // provider copy is never changed and a sync must not undo local state.
        const messageUpdate = { ...message };
        Reflect.deleteProperty(messageUpdate, "isArchived");
        Reflect.deleteProperty(messageUpdate, "isRead");
        await tx.mailMessage.upsert({
          where: {
            accountId_externalId: {
              accountId: options.accountId,
              externalId: message.externalId,
            },
          },
          update: messageUpdate,
          create: { ...message, accountId: options.accountId },
        });
      }
      await tx.mailMessage.deleteMany({
        where: { accountId: options.accountId, date: { lt: cutoff } },
      });

      const overflow = await tx.mailMessage.findMany({
        where: { accountId: options.accountId },
        orderBy: { date: "desc" },
        skip: MAIL_MESSAGE_CAP,
        select: { id: true },
      });
      if (overflow.length) {
        await tx.mailMessage.deleteMany({
          where: { id: { in: overflow.map((message) => message.id) } },
        });
      }
      await tx.mailAccount.update({
        where: { id: options.accountId },
        data: {
          status: MailAccountStatus.ACTIVE,
          syncError: null,
          lastSyncAt: newDate(),
          ...(options.cursor !== undefined && { syncCursor: options.cursor }),
        },
      });
    },
    { timeout: 30_000 }
  );
}

export async function getMailAccountSyncError(
  accountId: string
): Promise<string | null> {
  const account = await prisma.mailAccount.findUnique({
    where: { id: accountId },
    select: { syncError: true },
  });
  return account?.syncError ?? null;
}

/**
 * Stop syncing an account whose sign-in no longer works. It shows as ERROR
 * ("reconnect") until the person connects it again, which clears both columns.
 * `code` is a short fixed code, never provider text.
 */
export async function pauseMailAccountSync(accountId: string, code: string) {
  return prisma.mailAccount.update({
    where: { id: accountId },
    data: {
      status: MailAccountStatus.ERROR,
      syncPausedAt: newDate(),
      syncError: code,
    },
  });
}

/** Remember a failure that might be permanent, without pausing yet. */
export async function recordMailSyncError(accountId: string, code: string) {
  return prisma.mailAccount.update({
    where: { id: accountId },
    data: { status: MailAccountStatus.ERROR, syncError: code },
  });
}

export async function setMailAccountError(accountId: string) {
  return prisma.mailAccount.update({
    where: { id: accountId },
    data: { status: MailAccountStatus.ERROR },
  });
}

export async function listMailMessages(options: {
  userId: string;
  accountId?: string | null;
  focusedSplitId?: string | null;
  take?: number;
  cursor?: string | null;
}) {
  const take = Math.min(Math.max(options.take ?? 60, 1), 100);
  const now = newDate();
  const focusedSplit = options.focusedSplitId
    ? await prisma.mailFocusedSplit.findFirst({
        where: { id: options.focusedSplitId, userId: options.userId },
        select: { senderAddress: true },
      })
    : null;
  // A forged or deleted personal split must never fall back to the full inbox.
  if (options.focusedSplitId && !focusedSplit) return [];
  return prisma.mailMessage.findMany({
    where: {
      account: { userId: options.userId },
      accountId: options.accountId || undefined,
      ...(focusedSplit && { fromAddress: focusedSplit.senderAddress }),
      isArchived: false,
      OR: [{ snoozedUntil: null }, { snoozedUntil: { lte: now } }],
    },
    include: {
      account: {
        select: { id: true, provider: true, address: true, status: true },
      },
    },
    orderBy: [{ date: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(options.cursor && { cursor: { id: options.cursor }, skip: 1 }),
  });
}

export async function getMailMessage(userId: string, messageId: string) {
  return prisma.mailMessage.findFirst({
    where: { id: messageId, account: { userId } },
    include: { account: { include: { connection: true } } },
  });
}

export async function updateMailMessage(
  userId: string,
  messageId: string,
  data: Prisma.MailMessageUpdateInput
) {
  const message = await getMailMessage(userId, messageId);
  if (!message) return null;
  return prisma.mailMessage.update({ where: { id: message.id }, data });
}
