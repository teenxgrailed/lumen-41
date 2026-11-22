/**
 * Cookie consent: one first-party cookie, `needt_consent=accepted|declined`,
 * scoped to `.needt.app` so a single choice covers the landing (needt.app) and
 * the app (use.needt.app). The landing site writes and reads the same cookie.
 *
 * Only strictly necessary storage (auth and session cookies, theme, look)
 * runs without a choice. The choice gates the campaign-tag cookie
 * (`needt_utm`, see `attribution.ts`). Analytics (self-hosted Umami) is
 * cookieless, stores nothing on the device and sends no personal data (its
 * payloads are reduced by `umami-scrub.ts`), so it loads without a choice.
 */
import { UMAMI_BEFORE_SEND, umamiBeforeSend } from "@/lib/umami-scrub";

export type ConsentChoice = "accepted" | "declined";

export const CONSENT_COOKIE = "needt_consent";
/** About 180 days. */
export const CONSENT_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;
export const UMAMI_SCRIPT_SRC = "https://stats.needt.app/script.js";
/** Dispatched on `window` to reopen the banner (Settings → Privacy). */
export const COOKIE_SETTINGS_EVENT = "needt:cookie-settings";
/** Dispatched on `window` after a choice is saved. */
export const CONSENT_CHANGED_EVENT = "needt:consent-changed";

export function parseConsent(cookieHeader: string): ConsentChoice | null {
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name !== CONSENT_COOKIE) continue;
    let value: string;
    try {
      value = decodeURIComponent(rest.join("="));
    } catch {
      return null; // malformed cookie (a stray %): no choice, never throw in the layout
    }
    return value === "accepted" || value === "declined" ? value : null;
  }
  return null;
}

/** The Set-Cookie string for a choice on the given host. */
export function consentCookie(
  choice: ConsentChoice,
  host: string,
  secure: boolean
): string {
  const shared = host === "needt.app" || host.endsWith(".needt.app");
  return [
    `${CONSENT_COOKIE}=${choice}`,
    `Max-Age=${CONSENT_MAX_AGE_SECONDS}`,
    "Path=/",
    "SameSite=Lax",
    ...(shared ? ["Domain=.needt.app", "Secure"] : secure ? ["Secure"] : []),
  ].join("; ");
}

export function readConsent(): ConsentChoice | null {
  if (typeof document === "undefined") return null;
  return parseConsent(document.cookie);
}

export function writeConsent(choice: ConsentChoice): void {
  document.cookie = consentCookie(
    choice,
    window.location.hostname,
    window.location.protocol === "https:"
  );
  window.dispatchEvent(new Event(CONSENT_CHANGED_EVENT));
}

/**
 * Earlier builds wrote Umami's `umami.disabled` flag on Decline. Analytics no
 * longer waits for a choice, so a leftover flag would silently drop a
 * returning visitor: remove it.
 */
export function clearLegacyAnalyticsFlag(): void {
  try {
    window.localStorage.removeItem("umami.disabled");
  } catch {
    // storage blocked: nothing to clear
  }
}

/**
 * Adds the Umami script once. Cookieless; honours Do Not Track; every payload
 * goes through `umamiBeforeSend` (path and campaign tags only).
 */
export function loadAnalytics(websiteId: string | undefined): void {
  if (!websiteId) return;
  if (document.querySelector("script[data-needt-umami]")) return;
  (window as unknown as Record<string, unknown>)[UMAMI_BEFORE_SEND] =
    umamiBeforeSend;
  const script = document.createElement("script");
  script.defer = true;
  script.src = UMAMI_SCRIPT_SRC;
  script.setAttribute("data-website-id", websiteId);
  script.setAttribute("data-do-not-track", "true");
  script.setAttribute("data-before-send", UMAMI_BEFORE_SEND);
  script.setAttribute("data-needt-umami", "");
  document.head.appendChild(script);
}

export function openCookieSettings(): void {
  window.dispatchEvent(new Event(COOKIE_SETTINGS_EVENT));
}
