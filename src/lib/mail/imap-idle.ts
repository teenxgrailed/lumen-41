import { ImapFlow } from "imapflow";

import { logger } from "@/lib/logger";
import { getMailAccountForSync } from "@/lib/mail-db";
import { pinnedImapOptions } from "@/lib/mail/imap-pinned";
import { imapCredentials } from "@/lib/mail/providers";
import { enqueueMailSync } from "@/lib/queue/enqueue";

const LOG_SOURCE = "ImapIdle";
const IDLE_RESTART_INTERVAL_MS = 4 * 60 * 1_000;

const clients = new Map<string, ImapFlow>();

export async function ensureImapIdleWatcher(accountId: string): Promise<void> {
  if (clients.has(accountId)) return;
  const account = await getMailAccountForSync(accountId);
  if (!account || account.provider !== "IMAP" || account.status !== "ACTIVE") {
    return;
  }

  let credentials: ReturnType<typeof imapCredentials>;
  try {
    credentials = imapCredentials(account);
  } catch (error) {
    // Undecryptable or invalid stored credentials must never take the worker
    // down; the repeatable sync reports the account problem on its own.
    await logger.warn(
      "IMAP IDLE skipped: stored credentials are unusable",
      {
        accountId,
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
    return;
  }
  let connection: Awaited<ReturnType<typeof pinnedImapOptions>>;
  try {
    // Checked and pinned now, not only when the account was added.
    connection = await pinnedImapOptions(credentials);
  } catch (error) {
    await logger.warn(
      "IMAP IDLE skipped: the host is not reachable as a public address",
      {
        accountId,
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
    return;
  }
  const client = new ImapFlow({
    ...connection,
    maxIdleTime: IDLE_RESTART_INTERVAL_MS,
  });
  clients.set(accountId, client);
  client.on("exists", () => {
    void enqueueMailSync(accountId).catch((error: unknown) =>
      logger.warn(
        "Could not enqueue IMAP IDLE update",
        {
          accountId,
          error: error instanceof Error ? error.message : String(error),
        },
        LOG_SOURCE
      )
    );
  });
  client.on("error", (error: Error) => {
    void logger.warn(
      "IMAP IDLE watcher error",
      { accountId, error: error.message },
      LOG_SOURCE
    );
  });
  client.on("close", () => {
    if (clients.get(accountId) === client) clients.delete(accountId);
  });

  try {
    await client.connect();
    await client.mailboxOpen("INBOX");
    // ImapFlow starts IDLE automatically while the selected mailbox is
    // inactive and restarts it at maxIdleTime. The 5-minute repeatable queue
    // remains the fallback for providers without IDLE support.
  } catch (error) {
    clients.delete(accountId);
    await client.logout().catch(() => undefined);
    await logger.warn(
      "IMAP IDLE is unavailable; repeatable sync remains active",
      {
        accountId,
        error: error instanceof Error ? error.message : String(error),
      },
      LOG_SOURCE
    );
  }
}

/** Starts watchers for every account; one account's failure never rejects. */
export async function startImapIdleWatchers(
  accountIds: string[]
): Promise<void> {
  await Promise.all(
    accountIds.map((accountId) =>
      ensureImapIdleWatcher(accountId).catch((error: unknown) =>
        logger.warn(
          "IMAP IDLE watcher could not start",
          {
            accountId,
            error: error instanceof Error ? error.message : String(error),
          },
          LOG_SOURCE
        )
      )
    )
  );
}

export async function closeImapIdleWatchers(): Promise<void> {
  const active = [...clients.values()];
  clients.clear();
  await Promise.all(
    active.map((client) => client.logout().catch(() => undefined))
  );
}
