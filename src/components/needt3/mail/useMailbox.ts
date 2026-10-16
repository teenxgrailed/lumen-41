"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { formatInTimeZone, newDate } from "@/lib/date-utils";
import { addDays } from "@/lib/needt3/derive";
import { useCreateEvent } from "@/lib/needt3/hooks/events";
import {
  useArchiveMail,
  useMail,
  useMarkRead,
  useTrashMail,
} from "@/lib/needt3/hooks/mail";
import { useMailAccounts } from "@/lib/needt3/hooks/mail-accounts";
import { useMailSync } from "@/lib/needt3/hooks/mail-sync";
import { useTimeZone } from "@/lib/needt3/hooks/settings";
import {
  useCreateTask,
  useTasks,
  useTrashTask,
} from "@/lib/needt3/hooks/tasks";
import type { V3MailThread } from "@/lib/needt3/map";
import { notify } from "@/lib/notifications";

import {
  type MakeWhen,
  mailTaskDraft,
  tabList,
  withPending,
} from "../phone/mail/model";
import { type MailTab, groupByDay, madeTasks, tabCounts } from "./derive";
import { notices } from "./strings";

/**
 * The Mailbox's controller, shared by both faces. It is called ONCE by the
 * route component (`MailFaces`), above the face switch, and handed to the
 * phone face AND the desktop `MailScreen`: the selected view,
 * the open message, the tasks being made and every write live here, so
 * crossing 700 px never loses them or repeats a write. The data itself is
 * TanStack Query, shared with the desktop face by key.
 *
 * Every write goes through the v3 hooks (`useMarkRead`, `useArchiveMail`,
 * `useCreateTask` with the mail as the task's origin, `useCreateEvent`,
 * `useMailSync`). Mail stays read-only at the provider: nothing here sends,
 * drafts or trashes.
 */
export function useMailbox() {
  const tz = useTimeZone();
  const today = formatInTimeZone(newDate(), tz, "yyyy-MM-dd");
  const mail = useMail("inbox");
  const tasks = useTasks();
  const accounts = useMailAccounts();
  const markRead = useMarkRead();
  const archiveMail = useArchiveMail();
  const trashMail = useTrashMail();
  const createTask = useCreateTask();
  const trashTask = useTrashTask();
  const createEvent = useCreateEvent();
  const sync = useMailSync();
  const queryClient = useQueryClient();

  // The OAuth callback returns to /mail?connected=gmail (or ?error=...):
  // say what happened, refresh the account lists, drop the params.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const error = params.get("error");
    if (!connected && !error) return;
    if (connected === "gmail") notify.success(notices.connectedGmail);
    else if (connected === "outlook") notify.success(notices.connectedOutlook);
    else if (error === "mailbox-limit") notify.warning(notices.mailboxLimit);
    else if (error) notify.error(notices.connectFailed);
    void queryClient.invalidateQueries();
    params.delete("connected");
    params.delete("error");
    const rest = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${rest ? `?${rest}` : ""}${window.location.hash}`
    );
  }, [queryClient]);

  const [tab, setTab] = useState<MailTab>("needs");
  const [openId, setOpenId] = useState<string | null>(null);
  // the narrow desktop layout: the message fills the screen, back returns to the list
  const [reading, setReading] = useState(false);
  const [readOpen, setReadOpen] = useState(false);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const busy = useRef(new Set<string>());
  const openRef = useRef<string | null>(null);
  openRef.current = openId;

  const live = useMemo(() => mail.data ?? [], [mail.data]);
  const madeServer = useMemo(() => madeTasks(tasks.data ?? []), [tasks.data]);
  const made = useMemo(
    () => withPending(madeServer, pending),
    [madeServer, pending]
  );
  const list = useMemo(() => tabList(live, tab, made), [live, tab, made]);
  const counts = tabCounts(live, made);
  const groups = groupByDay(list, today);
  const unread = live.filter((m) => !m.isRead).length;
  const down = (accounts.data ?? []).filter((a) => a.status === "ERROR");

  // A pending mark is only a bridge: it goes once the server's task shows.
  useEffect(() => {
    if (!pending.size) return;
    if (![...pending].some((id) => madeServer.has(id))) return;
    setPending((p) => new Set([...p].filter((id) => !madeServer.has(id))));
  }, [pending, madeServer]);

  /** One write per message at a time: a double tap or a second face repeats nothing. */
  const once = useCallback(async (key: string, run: () => Promise<void>) => {
    if (busy.current.has(key)) return;
    busy.current.add(key);
    try {
      await run();
    } catch {
      // the hook already reverted the cache and told the person
    } finally {
      busy.current.delete(key);
    }
  }, []);

  const undoable = (msg: string, undo: () => Promise<void>) =>
    notify.success(msg, {
      action: { label: "Undo", onClick: () => void undo() },
    });

  const close = useCallback(() => {
    setOpenId(null);
    setReading(false);
  }, []);
  /** Nothing open any more: the narrow layout goes back to the list. */
  const closeIf = useCallback((id: string) => {
    if (openRef.current !== id) return;
    setOpenId(null);
    setReading(false);
  }, []);

  const open = useCallback(
    (m: V3MailThread) => {
      setOpenId(m.id);
      setReading(true);
      // its own key: a later "Mark as unread" must not be dropped by this one
      if (!m.isRead)
        void once(`autoread:${m.id}`, async () => {
          await markRead.mutateAsync({ id: m.id, isRead: true });
        });
    },
    [markRead, once]
  );

  const archive = useCallback(
    (m: V3MailThread) =>
      once(`archive:${m.id}`, async () => {
        closeIf(m.id);
        // archiving reads it too, in the same request
        await archiveMail.mutateAsync({ id: m.id, read: !m.isRead });
        //todo: Undo needs an un-archive action on /api/mail/messages/[id].
        notify.success(notices.archived);
      }),
    [archiveMail, closeIf, once]
  );

  const makeTask = useCallback(
    (m: V3MailThread, when: MakeWhen) =>
      once(`task:${m.id}`, async () => {
        setPending((p) => new Set(p).add(m.id));
        try {
          const { undo } = await createTask.mutateAsync({
            draft: mailTaskDraft(m, when, today),
          });
          undoable(
            when === "later" ? notices.taskForLater : notices.taskInInbox,
            undo
          );
        } catch (error) {
          setPending((p) => new Set([...p].filter((id) => id !== m.id)));
          throw error;
        }
      }),
    [createTask, once, today]
  );

  const takeBack = useCallback(
    (m: V3MailThread) =>
      once(`untask:${m.id}`, async () => {
        const taskId = madeServer.get(m.id);
        if (!taskId) return;
        const { undo } = await trashTask.trash(taskId);
        undoable(notices.taskTakenBack, undo);
      }),
    [madeServer, once, trashTask]
  );

  /** Tomorrow 10:00, 30 min, on the person's own Needt calendar. */
  const toCalendar = useCallback(
    (m: V3MailThread) =>
      once(`event:${m.id}`, async () => {
        const day = addDays(today, 1);
        const { undo } = await createEvent({
          title: m.subject || notices.noSubject,
          startAt: `${day}T10:00`,
          endAt: `${day}T10:30`,
          isAllDay: false,
        });
        undoable(notices.addedToCalendar, undo);
      }),
    [createEvent, once, today]
  );

  const setRead = useCallback(
    (m: V3MailThread, isRead: boolean) =>
      once(`read:${m.id}`, async () => {
        const { undo } = await markRead.mutateAsync({ id: m.id, isRead });
        undoable(isRead ? notices.markedRead : notices.markedUnread, undo);
      }),
    [markRead, once]
  );
  const toggleRead = useCallback(
    (m: V3MailThread) => setRead(m, !m.isRead),
    [setRead]
  );

  /** Move Needt's copy to Trash (the provider is not touched). */
  const trash = useCallback(
    (m: V3MailThread) =>
      once(`trash:${m.id}`, async () => {
        closeIf(m.id);
        const { undo } = await trashMail.mutateAsync({
          id: m.id,
          trashed: true,
        });
        undoable(notices.movedToTrash, undo);
      }),
    [closeIf, once, trashMail]
  );

  const syncNow = useCallback(
    () =>
      once("sync", async () => {
        try {
          const { queued } = await sync.mutateAsync();
          if (queued) notify.info(notices.syncing);
          else notify.info(notices.nothingToSync);
        } catch {
          notify.error(notices.syncFailed);
        }
      }),
    [once, sync]
  );

  return {
    today,
    tz,
    mail,
    tasks,
    accounts,
    live,
    made,
    madeServer,
    list,
    counts,
    groups,
    unread,
    down,
    tab,
    setTab,
    readOpen,
    toggleReadOpen: () => setReadOpen((v) => !v),
    openId,
    reading,
    setReading,
    open,
    close,
    archive,
    makeTask,
    takeBack,
    toCalendar,
    toggleRead,
    setRead,
    trash,
    syncNow,
    syncing: sync.isPending,
  };
}

export type Mailbox = ReturnType<typeof useMailbox>;
