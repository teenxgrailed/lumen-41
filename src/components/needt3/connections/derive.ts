/**
 * Connections derivations (connections.jsx), pure so they are tested apart
 * from the screen: merging the catalog with what is connected, the filters,
 * and what pressing "Connect" does for each kind of card.
 */
import type {
  CatalogCategory,
  CatalogEntry,
  IntegrationRow,
} from "@/lib/needt3/hooks/catalog";
import type { V3Connection } from "@/lib/needt3/hooks/connections";

export type CardState = "connected" | "disconnected" | "none";

export interface CnItem extends CatalogEntry {
  /** Unique per card: the slug, plus the account when a provider has several. */
  key: string;
  /** Mail entries are not in the server catalog; the screen adds them. */
  kind: "calendar" | "mail" | "app";
  state: CardState;
  /** The account behind a connected card: an email, or the toolkit. */
  account: string | null;
  /** Needs reconnecting (`state === "disconnected"`), with the reason. */
  detail: string | null;
  /** Id to disconnect with (calendar account, mailbox or integration). */
  accountId: string | null;
}

export const CATEGORY_LABEL: Record<string, string> = {
  calendar: "Calendars",
  mail: "Mail",
  communication: "Mail & chat",
  tasks: "Tasks",
  notes: "Notes",
  files: "Files",
  developer: "Developer",
  ai: "AI",
};

/** Mailboxes the Mailbox connects, listed beside the catalog. */
export const MAIL_ENTRIES: readonly CatalogEntry[] = [
  {
    slug: "gmail",
    name: "Gmail",
    description: "Read your mail in Needt and turn a thread into a task.",
    category: "communication",
    native: true,
    configured: true,
  },
  {
    slug: "outlook-mail",
    name: "Outlook Mail",
    description: "Read your mail in Needt and turn a thread into a task.",
    category: "communication",
    native: true,
    configured: true,
  },
];

const CAL_PROVIDER: Record<string, string> = {
  "google-calendar": "google",
  "outlook-calendar": "outlook",
  "icloud-calendar": "caldav",
};
const MAIL_PROVIDER: Record<string, string> = {
  gmail: "google",
  "outlook-mail": "outlook",
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Catalog + mailboxes, each with how it is connected. A native card is
 * connected when an account of its provider exists; a toolkit card when an
 * integration row for its slug is CONNECTED (an ERROR row needs
 * reconnecting). Several accounts of one native provider get one card each,
 * so Disconnect always names the one account it removes.
 */
export function buildItems(
  catalog: readonly CatalogEntry[],
  integrations: readonly IntegrationRow[],
  accounts: readonly V3Connection[]
): CnItem[] {
  // The server catalog may list a mailbox too (Gmail is also a Composio
  // toolkit). Here it would read the same mailbox account and draw the same
  // card twice under one key, so the native mailbox entry stands for it.
  const mailSlugs = new Set(MAIL_ENTRIES.map((entry) => entry.slug));
  const entries = [
    ...catalog.filter((entry) => !mailSlugs.has(entry.slug)),
    ...MAIL_ENTRIES,
  ];
  return entries.flatMap((entry): CnItem[] => {
    const calProvider = CAL_PROVIDER[entry.slug];
    const mailProvider = MAIL_PROVIDER[entry.slug];
    const base: CnItem = {
      ...entry,
      key: entry.slug,
      kind: (calProvider
        ? "calendar"
        : mailProvider
          ? "mail"
          : "app") as CnItem["kind"],
      state: "none",
      account: null,
      detail: null,
      accountId: null,
    };
    if (calProvider || mailProvider) {
      const hits = accounts.filter(
        (a) =>
          a.kind === (calProvider ? "calendar" : "mail") &&
          a.provider === (calProvider ?? mailProvider)
      );
      if (!hits.length) return [base];
      return hits.map((hit) => ({
        ...base,
        key: hits.length > 1 ? `${entry.slug}:${hit.accountId}` : entry.slug,
        state: hit.state === "connected" ? "connected" : "disconnected",
        account: hit.label,
        detail: hit.detail,
        accountId: hit.accountId,
      }));
    }
    const rows = integrations.filter(
      (r) => norm(r.toolkit) === norm(entry.slug)
    );
    const live = rows.find((r) => r.status === "CONNECTED");
    const failed = rows.find((r) => r.status === "ERROR");
    const row = live ?? failed;
    if (!row) return [base];
    return [
      {
        ...base,
        state: live ? "connected" : "disconnected",
        account: row.toolkit,
        detail: live ? null : "Access ended — reconnect to sync",
        accountId: row.id,
      },
    ];
  });
}

/** The confirm's title: names the account when the card has one. */
export function disconnectTitle(item: Pick<CnItem, "name" | "account">) {
  return item.account && item.account !== item.name
    ? `Disconnect ${item.name} (${item.account})?`
    : `Disconnect ${item.name}?`;
}

export type Show = "all" | "connected";

export interface Filter {
  q: string;
  /** A category id, or "all". */
  chip: string;
  show: Show;
}

export function filterItems(items: readonly CnItem[], f: Filter): CnItem[] {
  const needle = f.q.trim().toLowerCase();
  return items.filter((i) => {
    if (f.show === "connected" && i.state === "none") return false;
    if (f.chip !== "all" && i.category !== f.chip) return false;
    if (!needle) return true;
    return `${i.name} ${i.description} ${i.slug}`
      .toLowerCase()
      .includes(needle);
  });
}

/** Category chips in catalog order, each once. */
export function categoriesOf(items: readonly CnItem[]): CatalogCategory[] {
  return [...new Set(items.map((i) => i.category))];
}

export function counts(items: readonly CnItem[]) {
  return {
    connected: items.filter((i) => i.state === "connected").length,
    issues: items.filter((i) => i.state === "disconnected").length,
  };
}

export type ConnectPlan =
  | { kind: "navigate"; href: string }
  | { kind: "toolkit"; toolkit: string }
  | { kind: "caldav" }
  | { kind: "unavailable"; reason: string };

/**
 * What "Connect" / "Reconnect" does. Google and Outlook calendars and both
 * mailboxes start their own OAuth; Apple / iCloud takes a CalDAV login;
 * everything else is a Composio toolkit. `Needt API` is not a connection.
 */
export function connectPlan(
  item: Pick<CnItem, "slug" | "configured" | "native">
): ConnectPlan {
  if (!item.configured)
    return { kind: "unavailable", reason: "Not set up on this server yet." };
  switch (item.slug) {
    case "google-calendar":
      return { kind: "navigate", href: "/api/calendar/google/auth" };
    case "outlook-calendar":
      return { kind: "navigate", href: "/api/calendar/outlook/auth" };
    case "gmail":
      return { kind: "navigate", href: "/api/mail/oauth/google/auth" };
    case "outlook-mail":
      return { kind: "navigate", href: "/api/mail/oauth/outlook/auth" };
    case "icloud-calendar":
      return { kind: "caldav" };
    case "needt-api":
      return {
        kind: "unavailable",
        reason: "API links are not available in the new design yet.",
      };
    default:
      return item.native
        ? { kind: "unavailable", reason: "Not available yet." }
        : { kind: "toolkit", toolkit: item.slug };
  }
}

/** How a native card disconnects. */
export function disconnectKind(item: Pick<CnItem, "kind">) {
  return item.kind === "calendar"
    ? "calendar"
    : item.kind === "mail"
      ? "mailbox"
      : "toolkit";
}

export function pillOf(state: CardState, busy: boolean) {
  if (busy) return { label: "Connecting…", tone: "quiet" as const };
  if (state === "connected")
    return { label: "Connected", tone: "success" as const };
  if (state === "disconnected")
    return { label: "Needs attention", tone: "danger" as const };
  return { label: "Not connected", tone: "quiet" as const };
}

/** The sidebar-style status line: "3 connected · 1 needs attention". */
export function statusLine(c: { connected: number; issues: number }) {
  const parts = [`${c.connected} connected`];
  if (c.issues)
    parts.push(`${c.issues} ${c.issues === 1 ? "needs" : "need"} attention`);
  return parts.join(" · ");
}

/**
 * The free plan's AI-tools gate (owner, 08.10.26): the tab is locked, not
 * hidden. Locked only once the plan is known to be Free; while billing loads
 * (no kind yet) nothing is locked, so a paying person never sees the lock flash.
 */
export function aiToolsLocked(kind: string | null | undefined) {
  return kind === "free";
}
