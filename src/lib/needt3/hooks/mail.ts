"use client";

import { useQuery } from "@tanstack/react-query";

import { liveMail } from "@/lib/needt3/derive";
import {
  type ApiMailMessage,
  type V3MailThread,
  mailFromApi,
} from "@/lib/needt3/map";
import { type MailFolder, qk } from "@/lib/needt3/query-keys";

import {
  dropListItem,
  fetchJson,
  patchListItem,
  sendJson,
  useUndoableMutation,
} from "./core";
import { useTimeZone } from "./settings";

const MAIL = qk.mail();

/**
 * Mail, read-only at the provider (owner decision 2026-10-09): Needt reads,
 * marks read, archives, trashes its own copy and makes tasks. Reply and
 * Forward open the message in Gmail/Outlook.
 */
export function useMail(folder: MailFolder = "inbox", accountId?: string) {
  const tz = useTimeZone();
  return useQuery({
    queryKey: accountId ? [...qk.mail(folder), accountId] : qk.mail(folder),
    queryFn: async () => {
      const qs = accountId ? `?accountId=${encodeURIComponent(accountId)}` : "";
      const { messages } = await fetchJson<{ messages: ApiMailMessage[] }>(
        `/api/mail/messages${qs}`
      );
      //todo: paginate with nextCursor; the first 60 rows only for now.
      const list = messages.map((m) => mailFromApi(m, tz));
      if (folder === "inbox") return liveMail(list);
      if (folder === "trash") return list.filter((m) => !!m.trashedAt);
      if (folder === "archive")
        return list.filter((m) => m.isArchived && !m.trashedAt);
      return list;
    },
  });
}

export function useThread(id: string | null | undefined) {
  const tz = useTimeZone();
  return useQuery({
    queryKey: qk.thread(id ?? ""),
    enabled: !!id,
    queryFn: async () => {
      const row = await fetchJson<
        ApiMailMessage & { bodyHtml?: string | null }
      >(`/api/mail/messages/${id}`);
      return { ...mailFromApi(row, tz), bodyHtml: row.bodyHtml ?? null };
    },
  });
}

/** Mark read / unread; undo flips it back. */
export function useMarkRead() {
  return useUndoableMutation<{ id: string; isRead: boolean }, unknown>({
    scope: MAIL,
    label: "update the message",
    inverse: (_qc, { id, isRead }) => ({ id, isRead: !isRead }),
    optimistic: (qc, { id, isRead }) =>
      patchListItem<V3MailThread>(qc, MAIL, id, (m) => ({ ...m, isRead })),
    request: ({ id, isRead }) =>
      sendJson(`/api/mail/messages/${id}`, "PATCH", { isRead }),
  });
}

/** Trash / restore Needt's copy (the provider is not touched). */
export function useTrashMail() {
  return useUndoableMutation<{ id: string; trashed: boolean }, unknown>({
    scope: MAIL,
    label: "move the message",
    inverse: (_qc, { id, trashed }) => ({ id, trashed: !trashed }),
    optimistic: (qc, { id, trashed }) =>
      trashed
        ? dropListItem<V3MailThread>(qc, MAIL, id)
        : patchListItem<V3MailThread>(qc, MAIL, id, (m) => ({
            ...m,
            trashedAt: null,
          })),
    request: ({ id, trashed }) =>
      sendJson(`/api/mail/messages/${id}`, "PATCH", { trashed }),
  });
}

/**
 * Archive in Needt only (the provider mailbox is never changed). `read` also marks the message read in the same
 * request (archiving reads it, as in the prototype). There is no un-archive
 * route, so no undo yet.
 */
export function useArchiveMail() {
  return useUndoableMutation<{ id: string; read?: boolean }, unknown>({
    scope: MAIL,
    label: "archive the message",
    //todo: undo needs an un-archive action on /api/mail/messages/[id].
    optimistic: (qc, { id }) => dropListItem<V3MailThread>(qc, MAIL, id),
    request: ({ id, read }) =>
      sendJson(`/api/mail/messages/${id}`, "PATCH", {
        archive: true,
        ...(read && { isRead: true }),
      }),
  });
}
