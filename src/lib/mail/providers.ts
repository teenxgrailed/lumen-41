import { decryptSecret } from "@/services/ai/encryption";
import { ImapFlow } from "imapflow";

import { newDate } from "@/lib/date-utils";
import { imapConnectionOptions } from "@/lib/mail/imap-tls";
import {
  gmailBodyHtml,
  mapGmailMessage,
  mapGraphMessage,
  mapRawMimeMessage,
} from "@/lib/mail/mapping";
import {
  GmailMessageResource,
  GraphMailMessage,
  ImapCredentials,
  MailAccountWithConnection,
  MailSyncResult,
} from "@/lib/mail/types";
import { TokenManager } from "@/lib/token-manager";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const GRAPH_API = "https://graph.microsoft.com/v1.0/me";
const MAX_MESSAGES_PER_SYNC = 2_000;

interface GmailHistoryPage {
  history?: Array<{
    messages?: Array<{ id?: string }>;
    messagesAdded?: Array<{ message?: { id?: string } }>;
    messagesDeleted?: Array<{ message?: { id?: string } }>;
  }>;
  historyId?: string;
  nextPageToken?: string;
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let index = 0;
  async function worker() {
    while (index < values.length) {
      const current = index++;
      results[current] = await mapper(values[current]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker())
  );
  return results;
}

async function providerToken(
  account: MailAccountWithConnection
): Promise<string> {
  if (!account.connectionRef || !account.connection) {
    throw new Error("Mail account is missing its OAuth connection.");
  }
  const provider = account.provider === "GMAIL" ? "GOOGLE" : "OUTLOOK";
  const token = await TokenManager.getInstance().getValidAccessToken(
    provider,
    account.connectionRef,
    account.userId
  );
  if (!token) throw new Error("Mail OAuth token is unavailable.");
  return token;
}

async function jsonRequest<T>(
  url: string,
  token: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!response.ok) {
    throw new Error(`Mail provider request failed (${response.status}).`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function gmailMessage(token: string, id: string, format = "metadata") {
  const params = new URLSearchParams({ format });
  if (format === "metadata") {
    for (const header of ["From", "To", "Subject", "Date"]) {
      params.append("metadataHeaders", header);
    }
  }
  return jsonRequest<GmailMessageResource>(
    `${GMAIL_API}/messages/${encodeURIComponent(id)}?${params}`,
    token
  );
}

export async function syncGmail(
  account: MailAccountWithConnection
): Promise<MailSyncResult> {
  const token = await providerToken(account);
  let ids: string[] = [];
  let deletedExternalIds: string[] = [];
  let cursor = account.syncCursor;

  if (cursor) {
    try {
      let pageToken: string | undefined;
      do {
        const params: URLSearchParams = new URLSearchParams();
        params.set("startHistoryId", cursor);
        if (pageToken) params.set("pageToken", pageToken);
        const historyPage: GmailHistoryPage =
          await jsonRequest<GmailHistoryPage>(
            `${GMAIL_API}/history?${params}`,
            token
          );
        ids.push(
          ...(historyPage.history ?? []).flatMap((entry) =>
            [
              ...(entry.messages ?? []),
              ...(entry.messagesAdded ?? []).flatMap((item) =>
                item.message ? [item.message] : []
              ),
            ].flatMap((message) => (message.id ? [message.id] : []))
          )
        );
        deletedExternalIds.push(
          ...(historyPage.history ?? []).flatMap((entry) =>
            (entry.messagesDeleted ?? []).flatMap((item) =>
              item.message?.id ? [item.message.id] : []
            )
          )
        );
        cursor = historyPage.historyId ?? cursor;
        pageToken = historyPage.nextPageToken;
      } while (pageToken && ids.length < MAX_MESSAGES_PER_SYNC);
    } catch {
      cursor = null;
      ids = [];
      deletedExternalIds = [];
    }
  }

  if (!cursor) {
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        q: "newer_than:90d",
        maxResults: "500",
      });
      if (pageToken) params.set("pageToken", pageToken);
      const page = await jsonRequest<{
        messages?: Array<{ id?: string }>;
        nextPageToken?: string;
      }>(`${GMAIL_API}/messages?${params}`, token);
      ids.push(
        ...(page.messages ?? []).flatMap((message) =>
          message.id ? [message.id] : []
        )
      );
      pageToken = page.nextPageToken;
    } while (pageToken && ids.length < MAX_MESSAGES_PER_SYNC);
  }

  const uniqueIds = [...new Set(ids)].slice(0, MAX_MESSAGES_PER_SYNC);
  const resources = await mapWithConcurrency(uniqueIds, 10, (id) =>
    gmailMessage(token, id)
  );
  const messages = resources.flatMap((message) => {
    const mapped = mapGmailMessage(message);
    return mapped ? [mapped] : [];
  });
  cursor =
    resources.reduce<string | null>(
      (latest, message) =>
        BigInt(message.historyId || 0) > BigInt(latest || 0)
          ? message.historyId || latest
          : latest,
      cursor
    ) ?? cursor;
  return { cursor, messages, deletedExternalIds };
}

export async function fetchGmailBody(
  account: MailAccountWithConnection,
  externalId: string
) {
  const token = await providerToken(account);
  const message = await gmailMessage(token, externalId, "full");
  return gmailBodyHtml(message.payload);
}

const GRAPH_MESSAGE_SELECT = [
  "id",
  "conversationId",
  "from",
  "toRecipients",
  "subject",
  "bodyPreview",
  "receivedDateTime",
  "isRead",
  "categories",
  "parentFolderId",
].join(",");

export async function syncOutlookMail(
  account: MailAccountWithConnection
): Promise<MailSyncResult> {
  const token = await providerToken(account);
  const cutoff = newDate();
  cutoff.setDate(cutoff.getDate() - 90);
  let url =
    account.syncCursor ||
    `${GRAPH_API}/mailFolders/inbox/messages/delta?$select=${GRAPH_MESSAGE_SELECT}&$filter=receivedDateTime ge ${cutoff.toISOString()}&$top=100`;
  const resources: GraphMailMessage[] = [];
  let cursor = account.syncCursor;
  while (url && resources.length < MAX_MESSAGES_PER_SYNC) {
    const page = await jsonRequest<{
      value?: GraphMailMessage[];
      "@odata.nextLink"?: string;
      "@odata.deltaLink"?: string;
    }>(url, token, { headers: { Prefer: 'odata.maxpagesize="100"' } });
    resources.push(...(page.value ?? []));
    cursor = page["@odata.deltaLink"] ?? cursor;
    url = page["@odata.nextLink"] ?? "";
  }
  const deletedExternalIds = resources.flatMap((message) =>
    message.id && message["@removed"] ? [message.id] : []
  );
  const messages = resources.flatMap((message) => {
    const mapped = mapGraphMessage(message);
    return mapped ? [mapped] : [];
  });
  return { cursor, messages, deletedExternalIds };
}

export async function fetchOutlookBody(
  account: MailAccountWithConnection,
  externalId: string
) {
  const token = await providerToken(account);
  const message = await jsonRequest<GraphMailMessage>(
    `${GRAPH_API}/messages/${encodeURIComponent(externalId)}?$select=body`,
    token
  );
  const content = message.body?.content || "";
  return message.body?.contentType?.toLowerCase() === "text"
    ? `<p>${content
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\n", "<br>")}</p>`
    : content;
}

export function imapCredentials(account: MailAccountWithConnection) {
  const decrypted = decryptSecret(account.encryptedCredentials);
  if (!decrypted) throw new Error("IMAP credentials are unavailable.");
  const parsed = JSON.parse(decrypted) as ImapCredentials;
  if (
    !parsed.host ||
    !parsed.port ||
    !parsed.username ||
    !parsed.password ||
    typeof parsed.secure !== "boolean"
  ) {
    throw new Error("IMAP credentials are invalid.");
  }
  return parsed;
}

async function withImapClient<T>(
  account: MailAccountWithConnection,
  operation: (client: ImapFlow) => Promise<T>
) {
  const credentials = imapCredentials(account);
  const client = new ImapFlow({
    ...imapConnectionOptions(credentials),
    maxIdleTime: 4 * 60 * 1_000,
  });
  await client.connect();
  try {
    return await operation(client);
  } finally {
    await client.logout().catch(() => undefined);
  }
}

interface ImapCursor {
  uidValidity?: string;
  lastUid?: number;
}

export async function syncImap(
  account: MailAccountWithConnection
): Promise<MailSyncResult> {
  return withImapClient(account, async (client) => {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const cursor = account.syncCursor
        ? (JSON.parse(account.syncCursor) as ImapCursor)
        : {};
      const uidValidity = String(
        client.mailbox === false ? "" : client.mailbox.uidValidity
      );
      const cutoff = newDate();
      cutoff.setDate(cutoff.getDate() - 90);
      const uids =
        cursor.uidValidity === uidValidity && cursor.lastUid
          ? ((await client.search(
              { uid: `${cursor.lastUid + 1}:*` },
              { uid: true }
            )) as number[])
          : ((await client.search(
              { since: cutoff },
              { uid: true }
            )) as number[]);
      const selected = uids.slice(-MAX_MESSAGES_PER_SYNC);
      const messages = [];
      let lastUid = cursor.lastUid ?? 0;
      if (selected.length) {
        for await (const item of client.fetch(
          selected,
          { uid: true, flags: true, source: true },
          { uid: true }
        )) {
          if (!item.uid || !item.source) continue;
          lastUid = Math.max(lastUid, item.uid);
          messages.push(
            await mapRawMimeMessage({
              externalId: String(item.uid),
              raw: item.source,
              flags: [...(item.flags ?? [])],
            })
          );
        }
      }
      return {
        cursor: JSON.stringify({ uidValidity, lastUid }),
        messages,
      };
    } finally {
      lock.release();
    }
  });
}

export async function fetchImapBody(
  account: MailAccountWithConnection,
  externalId: string
) {
  return withImapClient(account, async (client) => {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const item = await client.fetchOne(
        Number(externalId),
        { source: true },
        { uid: true }
      );
      if (!item || !item.source)
        throw new Error("IMAP message body not found.");
      const mapped = await mapRawMimeMessage({
        externalId,
        raw: item.source,
        includeBody: true,
      });
      return mapped.bodyHtml || "";
    } finally {
      lock.release();
    }
  });
}
