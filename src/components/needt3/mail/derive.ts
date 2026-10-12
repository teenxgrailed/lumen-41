/**
 * Mailbox derivations (MailScreen.jsx), kept pure so they are tested apart
 * from the screen. Mail is read-only at the provider (owner, 2026-10-09):
 * Needt reads, archives, trashes its own copy and makes tasks; Reply and
 * Forward open the message at the provider.
 */
import { mailDayLabel } from "@/lib/needt3/derive";
import type { V3MailThread, V3Task } from "@/lib/needt3/map";

/** The tabs a read-only Mailbox keeps (Sent and Drafts need sending). */
export type MailTab = "needs" | "all" | "done";
export const MAIL_TABS: readonly MailTab[] = ["needs", "all", "done"];

/** Thread id → id of the live task it became (Task.originKind = "mail"). */
export function madeTasks(
  tasks: readonly Pick<V3Task, "id" | "source" | "trashedAt">[]
): Map<string, string> {
  const out = new Map<string, string>();
  for (const t of tasks) {
    if (t.trashedAt || t.source?.kind !== "mail" || !t.source.id) continue;
    if (!out.has(t.source.id)) out.set(t.source.id, t.id);
  }
  return out;
}

type Row = Pick<V3MailThread, "id" | "needsReply">;

export function inTab(m: Row, tab: MailTab, made: ReadonlyMap<string, string>) {
  if (tab === "all") return true;
  if (tab === "done") return made.has(m.id);
  return m.needsReply && !made.has(m.id);
}

export function tabCounts(
  live: readonly Row[],
  made: ReadonlyMap<string, string>
): Record<MailTab, number> {
  return {
    needs: live.filter((m) => inTab(m, "needs", made)).length,
    all: live.length,
    done: live.filter((m) => inTab(m, "done", made)).length,
  };
}

/** Rows grouped under their day heading, in list order. */
export function groupByDay<M extends Pick<V3MailThread, "receivedAt">>(
  list: readonly M[],
  today: string
): { day: string; rows: M[] }[] {
  const out: { day: string; rows: M[] }[] = [];
  for (const m of list) {
    const day = mailDayLabel(m.receivedAt, today);
    const last = out[out.length - 1];
    const hit =
      last && last.day === day ? last : out.find((g) => g.day === day);
    if (hit) hit.rows.push(m);
    else out.push({ day, rows: [m] });
  }
  return out;
}

/** Up to two initials for the avatar. */
export function initials(name: string | null | undefined) {
  return (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function firstName(name: string | null | undefined) {
  return (name || "").split(/\s+/)[0] || "";
}

export type MailProviderKind = "GMAIL" | "OUTLOOK" | "IMAP";

export interface MailRef {
  provider: MailProviderKind | string;
  externalId: string;
  /** The account's own address (Gmail picks the signed-in account by it). */
  address: string | null;
  subject?: string | null;
  fromAddress?: string | null;
}

/**
 * Where Reply and Forward go: the message in the provider's web app. IMAP
 * has no web app we can name, so it falls back to a `mailto:` reply.
 */
export function providerLink(ref: MailRef | null | undefined): string | null {
  if (!ref?.externalId) return null;
  if (ref.provider === "GMAIL") {
    const who = ref.address ? encodeURIComponent(ref.address) : "0";
    return `https://mail.google.com/mail/u/${who}/#all/${encodeURIComponent(ref.externalId)}`;
  }
  if (ref.provider === "OUTLOOK") {
    return `https://outlook.office.com/mail/deeplink/read/${encodeURIComponent(ref.externalId)}`;
  }
  if (!ref.fromAddress) return null;
  const subject = ref.subject
    ? `Re: ${ref.subject.replace(/^re:\s*/i, "")}`
    : "";
  return `mailto:${encodeURIComponent(ref.fromAddress)}${subject ? `?subject=${encodeURIComponent(subject)}` : ""}`;
}

/** The provider's name for "Reply in …". */
export function providerLabel(provider: string | null | undefined) {
  if (provider === "GMAIL") return "Gmail";
  if (provider === "OUTLOOK") return "Outlook";
  return "your mail app";
}
