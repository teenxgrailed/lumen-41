"use client";

import { useQuery } from "@tanstack/react-query";

import { qk } from "@/lib/needt3/query-keys";

import { fetchJson } from "./core";

/**
 * Mail accounts and per-message provider references for the v3 Mailbox
 * (T15). Kept beside `mail.ts` so the S1 file stays untouched; both read
 * the existing `/api/mail/*` routes only.
 */

export interface V3MailAccount {
  id: string;
  provider: "GMAIL" | "OUTLOOK" | "IMAP" | string;
  address: string;
  /** "ACTIVE" | "ERROR" | … (MailAccountStatus). */
  status: string;
  lastSyncAt: string | null;
  unread: number;
}

interface ApiMailAccount {
  id: string;
  provider: string;
  address: string;
  status: string;
  lastSyncAt?: string | null;
  _count?: { messages?: number };
}

/** `GET /api/mail/accounts`: the person's mailboxes and their sync state. */
export function useMailAccounts() {
  return useQuery({
    //todo: no contract key for mail accounts (02-task-plan §2.3); nested
    // under qk.mail() so mail invalidations refresh it. Asked in the T15 PR.
    queryKey: [...qk.mail(), "accounts"],
    queryFn: async (): Promise<V3MailAccount[]> =>
      (await fetchJson<ApiMailAccount[]>("/api/mail/accounts")).map((a) => ({
        id: a.id,
        provider: a.provider,
        address: a.address,
        status: a.status,
        lastSyncAt: a.lastSyncAt ?? null,
        unread: a._count?.messages ?? 0,
      })),
    staleTime: 60_000,
  });
}

export interface V3MailRef {
  provider: string;
  externalId: string;
  address: string | null;
  subject: string | null;
  fromAddress: string | null;
}

interface ApiMailMessageRef {
  externalId: string;
  subject?: string | null;
  fromAddress?: string | null;
  account?: { provider?: string; address?: string | null } | null;
}

/**
 * What Reply / Forward need to open the message at the provider. Read from
 * `GET /api/mail/messages/[id]` once the thread itself has loaded (`ready`),
 * so the provider body is fetched and cached once, not twice in a race.
 */
export function useMailRef(id: string | null | undefined, ready: boolean) {
  return useQuery({
    queryKey: [...qk.thread(id ?? ""), "ref"],
    enabled: !!id && ready,
    staleTime: Infinity,
    queryFn: async (): Promise<V3MailRef> => {
      const row = await fetchJson<ApiMailMessageRef>(
        `/api/mail/messages/${id}`
      );
      return {
        provider: row.account?.provider ?? "IMAP",
        externalId: row.externalId,
        address: row.account?.address ?? null,
        subject: row.subject ?? null,
        fromAddress: row.fromAddress ?? null,
      };
    },
  });
}
