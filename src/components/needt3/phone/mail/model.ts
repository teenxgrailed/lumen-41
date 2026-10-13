/**
 * The phone Mailbox's rules, kept pure so they are tested apart from the
 * screen (phone-mail.jsx). Mail is read-only at the provider (owner,
 * 2026-10-09): no send, no drafts, no Trash on the phone. What a person can
 * do is read, mark read / unread, archive, make a task and add to the
 * calendar; Reply and Forward open the message at the provider.
 */
import { mailDayLabel, mailTime } from "@/lib/needt3/derive";
import type { V3MailThread } from "@/lib/needt3/map";

import { type MailTab, inTab } from "../../mail/derive";

/** The day for older mail, the time for today's (`pmlWhen`). */
export function whenLabel(
  receivedAt: string | null | undefined,
  today: string
) {
  const day = mailDayLabel(receivedAt, today);
  return day === "Today" ? mailTime(receivedAt) : day;
}

/** "Today 09:12" / "Tuesday 18:40": the reader's header line. */
export function dayTime(receivedAt: string | null | undefined, today: string) {
  return [mailDayLabel(receivedAt, today), mailTime(receivedAt)]
    .filter(Boolean)
    .join(" ");
}

type Searchable = Pick<
  V3MailThread,
  "id" | "from" | "subject" | "preview" | "receivedAt"
>;

/** The pull-down's search: sender, subject or preview, up to five hits. */
export function searchMail<M extends Searchable>(
  list: readonly M[],
  query: string,
  today: string,
  limit = 5
) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return list
    .filter((m) =>
      [m.from, m.subject, m.preview].some((x) =>
        String(x || "")
          .toLowerCase()
          .includes(q)
      )
    )
    .slice(0, limit)
    .map((m) => ({
      id: m.id,
      title: m.subject || "No subject",
      meta: `${m.from} · ${whenLabel(m.receivedAt, today)}`,
    }));
}

/** Where a disconnected account is brought back (the desktop banner's links). */
export function reconnectHref(provider: string) {
  if (provider === "GMAIL") return "/api/mail/oauth/google/auth";
  if (provider === "OUTLOOK") return "/api/mail/oauth/outlook/auth";
  return "/settings#integrations";
}

/**
 * Thread id → task id, plus the threads whose task is still being created.
 * Without the pending ones a row swiped away to make a task would come back
 * for the moment between the swipe and the server's answer.
 */
export function withPending(
  made: ReadonlyMap<string, string>,
  pending: ReadonlySet<string>
) {
  if (!pending.size) return made;
  const out = new Map(made);
  for (const id of pending) if (!out.has(id)) out.set(id, "");
  return out;
}

/** What each swipe may do on a row: archive always, a task only once. */
export function swipeRules(
  m: Pick<V3MailThread, "id">,
  made: ReadonlyMap<string, string>
) {
  return { canArchive: true, canMakeTask: !made.has(m.id) };
}

export type MakeWhen = "today" | "later";

/** The task a message becomes: the desktop's draft, field for field. */
export function mailTaskDraft(
  m: Pick<V3MailThread, "id" | "subject" | "suggestedTask">,
  when: MakeWhen,
  today: string
) {
  return {
    title: m.suggestedTask || m.subject || "No subject",
    dueDate: when === "later" ? null : today,
    noSlot: when === "later",
    estimatedMinutes: 15,
    source: { kind: "mail" as const, id: m.id, quote: null },
  };
}

/** "All" with nothing unread folds under one "Read" line. */
export function foldsAsRead(
  tab: MailTab,
  list: readonly Pick<V3MailThread, "isRead">[]
) {
  return tab === "all" && list.length > 0 && list.every((m) => m.isRead);
}

export type MailEmpty =
  | { kind: "no-account"; title: string; line: string; cta: string }
  | { kind: "tab"; line: string; cta: string; to: MailTab | null };

const TAB_EMPTY: Record<MailTab, MailEmpty & { kind: "tab" }> = {
  needs: {
    kind: "tab",
    line: "Nothing needs you right now.",
    cta: "Show all mail",
    to: "all",
  },
  done: {
    kind: "tab",
    line: "No tasks from mail yet — hold a message and choose a task.",
    cta: "Show what needs you",
    to: "needs",
  },
  all: {
    kind: "tab",
    line: "Inbox clear ✓ — nothing waiting on you.",
    cta: "",
    to: null,
  },
};

/** Why the list is empty, or null when it is not. */
export function emptyFor(opts: {
  tab: MailTab;
  listLength: number;
  liveLength: number;
  accountsKnown: boolean;
  accountCount: number;
}): MailEmpty | null {
  if (opts.listLength) return null;
  if (opts.accountsKnown && opts.accountCount === 0 && opts.liveLength === 0)
    return {
      kind: "no-account",
      title: "No mail account connected",
      line: "Connect Gmail or Outlook and your mail shows up here.",
      cta: "Open Connections",
    };
  return TAB_EMPTY[opts.tab];
}

/** Rows of a tab, newest first as the API sends them. */
export function tabList<M extends Pick<V3MailThread, "id" | "needsReply">>(
  live: readonly M[],
  tab: MailTab,
  made: ReadonlyMap<string, string>
) {
  return live.filter((m) => inTab(m, tab, made));
}

/** One-line label of the unread figure. */
export function unreadLine(n: number) {
  return n ? `${n} unread` : "All read ✓";
}
