/**
 * The cookie banner is fixed to the viewport, so it lands in every screenshot
 * and can sit on top of controls a spec clicks. Every Playwright context
 * therefore starts with a saved choice (`needt_consent=declined`), the same
 * cookie the banner itself writes. A spec that tests the banner clears it.
 */
const CONSENT_COOKIE_NAME = "needt_consent";

export function consentCookieFor(baseUrl: string) {
  const { hostname } = new URL(baseUrl);
  return {
    name: CONSENT_COOKIE_NAME,
    value: "declined",
    domain: hostname,
    path: "/",
    expires: -1,
    httpOnly: false,
    secure: false,
    sameSite: "Lax" as const,
  };
}

/** Inline storage state for `use.storageState` in a Playwright config. */
export function declinedConsentStorageState(baseUrl: string) {
  return { cookies: [consentCookieFor(baseUrl)], origins: [] };
}
