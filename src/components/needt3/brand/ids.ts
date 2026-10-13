/**
 * Which brand mark each provider, toolkit or account of ours wears. This is
 * the ONE place a provider id becomes an icon id: the Connections cards, the
 * onboarding calendars, the sign-in buttons, the Settings row and the mail
 * chips all ask here. `__tests__/ids.test.ts` fails when something the
 * Connections screen can list has no mark.
 */
import { BRAND_ART, type BrandArtId } from "./data";

/** Drawn in code, not from artwork: Apple Calendar (weekday + today) and our own icon. */
export type BrandDrawnId = "ical" | "needt";
export type BrandId = BrandArtId | BrandDrawnId;

export const BRAND_IDS: readonly BrandId[] = [
  ...(Object.keys(BRAND_ART) as BrandArtId[]),
  "ical",
  "needt",
];

const own = (o: object, k: string) =>
  Object.prototype.hasOwnProperty.call(o, k);

export function hasBrandIcon(id: string | null | undefined): id is BrandId {
  return !!id && (id === "ical" || id === "needt" || own(BRAND_ART, id));
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Our ids that are not a brand id themselves, normalised (lower case, letters
 * and digits only): the integration catalog's slugs, the calendar and mail
 * provider ids, and the sign-in provider ids. A toolkit whose slug already is
 * a brand id (notion, slack, github, figma, zoom …) needs no line here.
 */
const ALIASES: Readonly<Record<string, BrandId>> = {
  // Native calendar entries (src/services/integrations/catalog.ts)
  googlecalendar: "gcal",
  outlookcalendar: "ocal",
  icloudcalendar: "ical",
  needtapi: "needt",
  // Mail entries the Connections screen adds (derive.ts MAIL_ENTRIES)
  outlookmail: "outlook",
  // Composio toolkits (composio-provider.ts CURATED_TOOLKITS)
  googlesheets: "gsheets",
  googledrive: "gdrive",
  microsoftoutlook: "outlook",
  microsoftteams: "teams",
  googlegemini: "gemini",
  // Account and sign-in provider ids
  azuread: "microsoft",
  twitter: "x",
  caldav: "ical",
};

/**
 * The mark for a provider, toolkit or catalog slug, or `null` when we have
 * none yet (the caller then draws the generic connection tile; see
 * `BrandIcon`).
 */
export function brandIdFor(key: string | null | undefined): BrandId | null {
  if (!key) return null;
  const k = norm(key);
  if (own(ALIASES, k)) return ALIASES[k];
  return hasBrandIcon(k) ? k : null;
}

/**
 * The mark for one connected account: the same provider is a different
 * product by kind (Google calendar is Google Calendar, Google mail is Gmail),
 * so the kind picks the app. An IMAP mailbox has no brand and returns `null`.
 */
export function brandIdForConnection(c: {
  kind: "calendar" | "mail" | "integration";
  provider: string;
}): BrandId | null {
  const p = norm(c.provider);
  if (c.kind === "calendar") {
    if (p === "google") return "gcal";
    if (p === "outlook" || p === "microsoft" || p === "azuread") return "ocal";
    return brandIdFor(p);
  }
  if (c.kind === "mail") {
    if (p === "google" || p === "gmail") return "gmail";
    if (p === "outlook" || p === "microsoft") return "outlook";
    if (p === "imap") return null;
    return brandIdFor(p);
  }
  return brandIdFor(p);
}
