/**
 * What the browser tracker may send to our Umami. Umami's script reports the
 * full page URL (query and hash included), the referrer and the page title.
 * Some of our pages carry secrets or an address in the URL
 * (`/auth/confirm-email?email=…&token=…`, `/auth/reset-password?token=…`,
 * `/p/<token>`, `/book/cancel/<token>`, `#code=…&verifier=…`), so this runs as
 * the script's `data-before-send` hook and reduces every payload to the path,
 * a short allowlist of campaign parameters, and no title.
 */

/** Campaign parameters kept so a launch (`?ref=producthunt`) is separable. */
export const KEPT_QUERY_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "ref",
  "via",
] as const;

/** Name of the global the Umami script looks up (`data-before-send`). */
export const UMAMI_BEFORE_SEND = "needtUmamiBeforeSend";

const MAX_VALUE_LENGTH = 100;
const SAFE_VALUE = /^[\p{L}\p{N} _.:+/-]+$/u;
const LOOKS_LIKE_EMAIL = /\S+(@|%40)\S+/;

/** Path segments that are a secret capability: replaced, never reported. */
const SECRET_PATHS: Array<[RegExp, string]> = [
  [/^\/p\/[^/]+/, "/p/:token"],
  [/^\/book\/cancel\/[^/]+/, "/book/cancel/:token"],
  [/^\/b\/[^/]+(\/[^/]+)?/, "/b/:id"],
];

function cleanValue(raw: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim().slice(0, MAX_VALUE_LENGTH);
  if (!value || LOOKS_LIKE_EMAIL.test(value)) return null;
  return SAFE_VALUE.test(value) ? value : null;
}

function scrubPath(pathname: string): string {
  for (const [pattern, replacement] of SECRET_PATHS) {
    if (pattern.test(pathname)) return pathname.replace(pattern, replacement);
  }
  return pathname;
}

/** A page URL reduced to its path plus the kept campaign parameters. */
export function scrubUrl(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    const url = new URL(raw, "https://use.needt.app");
    const kept = new URLSearchParams();
    for (const key of KEPT_QUERY_KEYS) {
      const value = cleanValue(url.searchParams.get(key));
      if (value) kept.set(key, value);
    }
    const query = kept.toString();
    return `${scrubPath(url.pathname)}${query ? `?${query}` : ""}`;
  } catch {
    return "/";
  }
}

/** A referrer reduced to origin and path: another site's query is not ours. */
export function scrubReferrer(raw: unknown): unknown {
  if (typeof raw !== "string" || !raw) return raw;
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "";
  }
}

/**
 * The `data-before-send` hook. Returns the payload to send; the title is
 * dropped (a page title may hold a task or page name).
 */
export function umamiBeforeSend<T extends Record<string, unknown>>(
  _type: string,
  payload: T
): T {
  const next: Record<string, unknown> = { ...payload };
  if ("url" in next) next.url = scrubUrl(next.url);
  if ("referrer" in next) next.referrer = scrubReferrer(next.referrer);
  if ("title" in next) next.title = "";
  return next as T;
}
