/**
 * Baseline security headers for every response of the app host. The same
 * values sit in next.config.js headers() (static files, which middleware does
 * not see); keep the two in step (src/__tests__/security-headers.test.ts).
 *
 * No includeSubDomains / preload on HSTS: other *.needt.app hosts are
 * separate apps. X-Frame-Options is SAMEORIGIN because nothing frames this
 * host from another origin; /oauth keeps its own stricter DENY.
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "Strict-Transport-Security": "max-age=31536000",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

/** Paths that set their own, stricter framing and referrer headers. */
function ownsItsHeaders(pathname: string): boolean {
  return pathname === "/oauth" || pathname.startsWith("/oauth/");
}

/**
 * Set the baseline on a response without overriding a header a route already
 * chose (an attachment download sets its own nosniff, /oauth sets DENY).
 */
export function applySecurityHeaders(headers: Headers, pathname: string): void {
  const oauth = ownsItsHeaders(pathname);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (oauth && (name === "X-Frame-Options" || name === "Referrer-Policy")) {
      continue;
    }
    if (!headers.has(name)) headers.set(name, value);
  }
}
