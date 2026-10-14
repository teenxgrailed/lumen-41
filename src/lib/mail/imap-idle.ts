import { ImapFlow } from "imapflow";

import { logger } from "@/lib/logger";
import { getMailAccountForSync } from "@/lib/mail-db";
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

  const credentials = imapCredentials(account);
  const client = new ImapFlow({
    host: credentials.host,
    port: credentials.port,
    secure: credentials.secure,
    auth: { user: credentials.username, pass: credentials.password },
    logger: false,
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

export async function closeImapIdleWatchers(): Promise<void> {
  const active = [...clients.values()];
  clients.clear();
  await Promise.all(
    active.map((client) => client.logout().catch(() => undefined))
  );
}
