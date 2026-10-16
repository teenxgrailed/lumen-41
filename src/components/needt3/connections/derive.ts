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

import { strings } from "./strings";

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

/**
 * The prototype's category chips (connections-data.js `CN_CHIPS`): All
 * categories · Mail & chat · Calendars · Work · Files · Creative. Our catalogue
 * has seven real categories (`CatalogCategory`), so each card is mapped onto
 * one chip, `chipOf`:
 *
 *   communication (Gmail, Outlook, Slack, Teams, Discord)  -> Mail & chat
 *   calendar (Google, Outlook, Apple / iCloud)             -> Calendars
 *   tasks, notes, developer, ai (Todoist, Notion, Linear)  -> Work
 *   files (Drive, Dropbox, Sheets)                         -> Files
 *   GitHub, GitLab (developer, but the prototype files
 *   GitHub under Files)                                    -> Files
 *   Figma, Pinterest, Canva, Miro, Spotify                 -> Creative
 *
 * Nothing in today's catalogue is Creative, so that chip is only drawn once an
 * entry maps to it (`chipsOf`); a chip that always opens an empty list is a
 * dead control. A category the server adds later lands under Work, the
 * nearest general one.
 */
export type ChipId = "mail" | "cal" | "work" | "files" | "creative";

export const CHIP_LABEL: Record<ChipId, string> = {
  mail: "Mail & chat",
  cal: "Calendars",
  work: "Work",
  files: "Files",
  creative: "Creative",
};

/** Prototype order. */
export const CHIP_ORDER: readonly ChipId[] = [
  "mail",
  "cal",
  "work",
  "files",
  "creative",
];

const CHIP_OF_CATEGORY: Record<CatalogCategory, ChipId> = {
  communication: "mail",
  calendar: "cal",
  tasks: "work",
  notes: "work",
  developer: "work",
  ai: "work",
  files: "files",
};

const CHIP_OF_SLUG: Record<string, ChipId> = {
  github: "files",
  gitlab: "files",
  figma: "creative",
  pinterest: "creative",
  canva: "creative",
  miro: "creative",
  spotify: "creative",
};

export function chipOf(item: Pick<CatalogEntry, "slug" | "category">): ChipId {
  return CHIP_OF_SLUG[item.slug] ?? CHIP_OF_CATEGORY[item.category] ?? "work";
}

/** The chips to draw: each of the prototype's that has at least one card. */
export function chipsOf(items: readonly CnItem[]): ChipId[] {
  const have = new Set(items.map(chipOf));
  return CHIP_ORDER.filter((id) => have.has(id));
}

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
/** The mail account list reports GMAIL / OUTLOOK, lower-cased. */
const MAIL_PROVIDER: Record<string, readonly string[]> = {
  gmail: ["gmail", "google"],
  "outlook-mail": ["outlook"],
};

/** The calendar entry whose OAuth client a mailbox shares. */
const CAL_SIBLING: Record<string, string> = {
  gmail: "google-calendar",
  "outlook-mail": "outlook-calendar",
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
  // A mailbox signs in with the same Google / Microsoft client as the
  // calendar of that provider, so it is set up exactly when that calendar is.
  const mailEntries = MAIL_ENTRIES.map((entry): CatalogEntry => {
    const sibling = catalog.find(
      (c) => CAL_SIBLING[entry.slug] === c.slug && c.native
    );
    return {
      ...entry,
      configured: sibling?.configured ?? true,
      requires: sibling?.requires,
    };
  });
  const entries = [
    ...catalog.filter((entry) => !mailSlugs.has(entry.slug)),
    ...mailEntries,
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
          (calProvider
            ? a.provider === calProvider
            : (mailProvider ?? []).includes(a.provider))
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
  /** A chip id (`ChipId`), or "all". */
  chip: string;
  show: Show;
}

export function filterItems(items: readonly CnItem[], f: Filter): CnItem[] {
  const needle = f.q.trim().toLowerCase();
  return items.filter((i) => {
    if (f.show === "connected" && i.state === "none") return false;
    if (f.chip !== "all" && chipOf(i) !== f.chip) return false;
    if (!needle) return true;
    // The prototype's haystack: name, one-liner, search words, chip name.
    return `${i.name} ${i.description} ${i.slug} ${CHIP_LABEL[chipOf(i)]}`
      .toLowerCase()
      .includes(needle);
  });
}

/** Real categories in catalog order, each once (the card's kind line). */
export function categoriesOf(items: readonly CnItem[]): CatalogCategory[] {
  return [...new Set(items.map((i) => i.category))];
}

export function counts(items: readonly CnItem[]) {
  return {
    connected: items.filter((i) => i.state === "connected").length,
    issues: items.filter((i) => i.state === "disconnected").length,
  };
}

/**
 * Why a connector cannot start. The person who runs the server is told what to
 * add; everyone else is told it is not there yet (nothing they can do).
 */
export function unavailableReason(
  name: string,
  requires: string | undefined,
  admin: boolean
) {
  return admin && requires
    ? strings.adminNeeds(name, requires)
    : strings.notAvailable(name);
}

/**
 * What the list draws. A connector this server cannot start is a dead control,
 * so only an admin (who can fix it) sees it; the sign-in screen does the same
 * with providers that have no credentials. One that is already connected stays
 * whatever happens, so it can be reconnected or removed.
 */
export function visibleItems(items: readonly CnItem[], admin: boolean) {
  return items.filter((i) => admin || i.configured || i.state !== "none");
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
  item: Pick<CnItem, "slug" | "configured" | "native"> &
    Partial<Pick<CnItem, "name" | "requires">>,
  admin = false
): ConnectPlan {
  if (!item.configured)
    return {
      kind: "unavailable",
      reason: unavailableReason(item.name ?? item.slug, item.requires, admin),
    };
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

export type StatusTone = "ok" | "bad" | "none";

/**
 * The pill under the hero (connections.jsx `status` / `statusTone`), counting
 * only the tab in front of you: something lost access -> "Outlook needs
 * reconnecting" (red); N connected -> "N connected"; nothing -> "Nothing
 * connected yet" (grey). The prototype adds "· all syncing", but the server
 * reports no sync state, so it is left out.
 */
export function heroStatus(
  items: readonly Pick<CnItem, "name" | "state">[],
  tab: "apps" | "ai"
): { text: string; tone: StatusTone; names: string[] } {
  const names = [
    ...new Set(
      items.filter((i) => i.state === "disconnected").map((i) => i.name)
    ),
  ];
  if (names.length)
    return {
      text: `${names.join(", ")} ${names.length === 1 ? "needs" : "need"} reconnecting`,
      tone: "bad",
      names,
    };
  const live = items.filter((i) => i.state === "connected").length;
  if (!live)
    return {
      text:
        tab === "ai" ? "No AI tools connected yet" : "Nothing connected yet",
      tone: "none",
      names,
    };
  return {
    text: `${live} connected`,
    tone: "ok",
    names,
  };
}

/**
 * The free plan's AI-tools gate (owner, 08.10.26): the tab is locked, not
 * hidden. Locked only once the plan is known to be Free; while billing loads
 * (no kind yet) nothing is locked, so a paying person never sees the lock flash.
 */
export function aiToolsLocked(kind: string | null | undefined) {
  return kind === "free";
}
