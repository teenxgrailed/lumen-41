/**
 * Campaign attribution (UTM). The landing site forwards `utm_source`,
 * `utm_medium`, `utm_campaign`, `utm_term` and `utm_content` on its sign-up
 * links; the app keeps them in a short-lived first-party cookie
 * (`needt_utm`) and the server attaches them to the `signup_completed`
 * event. Event data only: nothing is stored on the user row.
 *
 * The cookie is written only after the visitor accepted analytics (see
 * `cookie-consent.ts`); without consent nothing is kept and the event simply
 * carries no tags. A tag holds a campaign label, never a person.
 */
import { parseConsent } from "@/lib/cookie-consent";

export const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const;

export type UtmKey = (typeof UTM_KEYS)[number];
export type UtmTags = Partial<Record<UtmKey, string>>;

export const UTM_COOKIE = "needt_utm";
/** 30 days: a visit to the sign-up a few weeks later still counts. */
export const UTM_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const MAX_VALUE_LENGTH = 100;
/** Letters, digits and the punctuation campaign names use. No markup. */
const SAFE_VALUE = /^[\p{L}\p{N} _.:+/-]+$/u;
/** Some mail tools fill a tag with the subscriber's address: never keep one. */
const LOOKS_LIKE_EMAIL = /\S+(@|%40)\S+/;

function cleanValue(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim().slice(0, MAX_VALUE_LENGTH);
  if (!value || LOOKS_LIKE_EMAIL.test(value)) return null;
  return SAFE_VALUE.test(value) ? value : null;
}

/** The UTM tags in a query string (`?utm_source=x`), cleaned. */
export function utmFromSearch(search: string): UtmTags {
  const params = new URLSearchParams(search);
  const tags: UtmTags = {};
  for (const key of UTM_KEYS) {
    const value = cleanValue(params.get(key));
    if (value) tags[key] = value;
  }
  return tags;
}

/** The cookie value for a set of tags, or null when there is nothing to keep. */
export function serializeUtm(tags: UtmTags): string | null {
  const params = new URLSearchParams();
  for (const key of UTM_KEYS) {
    const value = cleanValue(tags[key]);
    if (value) params.set(key, value);
  }
  const text = params.toString();
  return text || null;
}

/** The Set-Cookie string for the tags, or null when there are none. */
export function utmCookie(tags: UtmTags, secure: boolean): string | null {
  const value = serializeUtm(tags);
  if (!value) return null;
  return [
    `${UTM_COOKIE}=${encodeURIComponent(value)}`,
    `Max-Age=${UTM_MAX_AGE_SECONDS}`,
    "Path=/",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

/** The tags in a `Cookie` header; empty when the cookie is absent or broken. */
export function utmFromCookieHeader(cookieHeader: string | null): UtmTags {
  if (!cookieHeader) return {};
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name !== UTM_COOKIE) continue;
    try {
      return utmFromSearch(decodeURIComponent(rest.join("=")));
    } catch {
      return {};
    }
  }
  return {};
}

/** The Set-Cookie string that removes the cookie (consent withdrawn). */
export function expiredUtmCookie(secure: boolean): string {
  return [
    `${UTM_COOKIE}=`,
    "Max-Age=0",
    "Path=/",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");
}

/**
 * The tags in a `Cookie` header, but only while the visitor's analytics
 * choice in the same header is "accepted". Anything else gives no tags, even
 * when an old `needt_utm` cookie is still there.
 */
export function consentedUtmFromCookieHeader(
  cookieHeader: string | null
): UtmTags {
  if (!cookieHeader || parseConsent(cookieHeader) !== "accepted") return {};
  return utmFromCookieHeader(cookieHeader);
}
