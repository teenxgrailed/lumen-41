/**
 * Which calendars v3 can write into, and how the picker tells them apart.
 *
 * Pure: feeds in, rows out. A person's own Needt (LOCAL) calendar and the
 * calendars synced from Google, Outlook or CalDAV are all writable; the
 * provider ones through the provider routes (see ./provider-events).
 */

export interface ApiFeedAccount {
  id?: string;
  provider?: string | null;
  email?: string | null;
}

export interface ApiFeed {
  id: string;
  type: string;
  name: string;
  color?: string | null;
  enabled?: boolean;
  /** Provider calendar id / URL (Google: the calendar id). */
  url?: string | null;
  /** The connected account a synced feed belongs to (GET /api/feeds). */
  account?: ApiFeedAccount | null;
}

const PROVIDER_ROUTES: Record<string, string> = {
  GOOGLE: "/api/calendar/google/events",
  OUTLOOK: "/api/calendar/outlook/events",
  CALDAV: "/api/calendar/caldav/events",
};

const PROVIDER_NAMES: Record<string, string> = {
  GOOGLE: "Google",
  OUTLOOK: "Outlook",
  CALDAV: "CalDAV",
};

/** The route that writes events of this feed type, or null for LOCAL. */
export function providerEventsRoute(type: string | null | undefined) {
  return type ? (PROVIDER_ROUTES[type] ?? null) : null;
}

export function isProviderFeed(feed: Pick<ApiFeed, "type">) {
  return providerEventsRoute(feed.type) !== null;
}

/*
 * The feed row stores no access role, so read-only calendars are recognised by
 * the Google calendar ids that are always read-only: holidays, contacts
 * (birthdays), and subscribed ICS feeds.
 */
const READ_ONLY_GOOGLE = [
  /#holiday@group\.v\.calendar\.google\.com$/i,
  /#contacts@group\.v\.calendar\.google\.com$/i,
  /@import\.calendar\.google\.com$/i,
  /@holiday\.calendar\.google\.com$/i,
];

export function isReadOnlyFeed(feed: Pick<ApiFeed, "type" | "url">) {
  if (feed.type !== "GOOGLE" || !feed.url) return false;
  const id = feed.url;
  return READ_ONLY_GOOGLE.some((re) => re.test(id));
}

/** A calendar the person can add events to from v3. */
export function isWritableFeed(feed: ApiFeed) {
  if (feed.enabled === false) return false;
  if (feed.type === "LOCAL") return true;
  return isProviderFeed(feed) && !isReadOnlyFeed(feed);
}

/** Writable calendars, the Needt (LOCAL) ones first, otherwise in feed order. */
export function writableFeeds(feeds: readonly ApiFeed[]): ApiFeed[] {
  const ok = feeds.filter(isWritableFeed);
  return [
    ...ok.filter((f) => f.type === "LOCAL"),
    ...ok.filter((f) => f.type !== "LOCAL"),
  ];
}

/**
 * The second line of a picker row. It is what tells a Needt calendar and a
 * Google calendar that are both called "Needt" apart: the account's email.
 */
export function feedSubtitle(feed: ApiFeed): string {
  if (feed.type === "LOCAL") return "Only in Needt";
  return (
    feed.account?.email?.trim() ||
    PROVIDER_NAMES[feed.type] ||
    feed.type.toLowerCase()
  );
}

/**
 * The calendar a new event starts in: the last one the person picked if it is
 * still writable, else the first Needt (LOCAL) calendar, else the first one.
 */
export function defaultFeed(
  feeds: readonly ApiFeed[],
  lastId?: string | null
): ApiFeed | null {
  const ok = writableFeeds(feeds);
  return ok.find((f) => f.id === lastId) ?? ok[0] ?? null;
}
