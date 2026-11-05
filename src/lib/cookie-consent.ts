/**
 * Cookie consent: one first-party cookie, `needt_consent=accepted|declined`,
 * scoped to `.needt.app` so a single choice covers the landing (needt.app) and
 * the app (use.needt.app). The landing site writes and reads the same cookie.
 *
 * Only strictly necessary storage (auth and session cookies, theme, look)
 * runs without a choice. Analytics (self-hosted Umami) loads after Accept.
 */

export type ConsentChoice = "accepted" | "declined";

export const CONSENT_COOKIE = "needt_consent";
/** About 180 days. */
export const CONSENT_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;
export const UMAMI_SCRIPT_SRC = "https://stats.needt.app/script.js";
/** Dispatched on `window` to reopen the banner (Settings → Privacy). */
export const COOKIE_SETTINGS_EVENT = "needt:cookie-settings";

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
}

/** Umami's own switch: with this set its script records nothing. */
export function setAnalyticsDisabled(disabled: boolean): void {
  try {
    if (disabled) window.localStorage.setItem("umami.disabled", "1");
    else window.localStorage.removeItem("umami.disabled");
  } catch {
    // storage blocked: the script is simply not loaded
  }
}

/** Adds the Umami script once. Called only after the visitor accepted. */
export function loadAnalytics(websiteId: string | undefined): void {
  if (!websiteId) return;
  if (document.querySelector("script[data-needt-umami]")) return;
  const script = document.createElement("script");
  script.defer = true;
  script.src = UMAMI_SCRIPT_SRC;
  script.setAttribute("data-website-id", websiteId);
  script.setAttribute("data-do-not-track", "true");
  script.setAttribute("data-needt-umami", "");
  document.head.appendChild(script);
}

export function openCookieSettings(): void {
  window.dispatchEvent(new Event(COOKIE_SETTINGS_EVENT));
}
