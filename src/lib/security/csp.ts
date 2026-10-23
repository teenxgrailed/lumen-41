/**
 * The app-wide Content Security Policy, sent as `Content-Security-Policy-
 * Report-Only` by middleware: browsers report what it would block to
 * `/api/csp-report` and block nothing. Enforce it only after the reports have
 * been read for a while.
 *
 * Every external origin here is one the browser actually talks to:
 * - stats.needt.app: the Umami script and its events (src/app/layout.tsx).
 * - *.sentry.io: the browser SDK's envelopes (instrumentation-client.ts).
 * - NEXT_PUBLIC_COLLABORATION_URL: the page and moodboard collaboration socket.
 * - Google, Microsoft and Apple sign-in, and Creem checkout, as form targets.
 * Fonts come from next/font, which serves them from 'self'. Images and media
 * are open to any https source because pages, boards and avatars embed them.
 *
 * Scripts keep 'unsafe-inline' because Next.js inlines its bootstrap scripts
 * and there are no nonces yet (they would force every page to render
 * dynamically). //todo: nonces before this policy is enforced.
 */

export const CSP_REPORT_PATH = "/api/csp-report";

export const UMAMI_ORIGIN = "https://stats.needt.app";
export const SENTRY_ORIGIN = "https://*.sentry.io";

const SIGN_IN_ORIGINS = [
  "https://accounts.google.com",
  "https://login.microsoftonline.com",
  "https://appleid.apple.com",
];
const CHECKOUT_ORIGIN = "https://*.creem.io";

/** The ws(s) origin of the collaboration server, or null when unset/invalid. */
export function collaborationOrigin(url: string | undefined): string | null {
  if (!url?.trim()) return null;
  try {
    const parsed = new URL(url.trim());
    if (!["ws:", "wss:", "http:", "https:"].includes(parsed.protocol)) {
      return null;
    }
    return parsed.origin === "null"
      ? `${parsed.protocol}//${parsed.host}`
      : parsed.origin;
  } catch {
    return null;
  }
}

export function contentSecurityPolicy(
  options: {
    collaborationUrl?: string;
    development?: boolean;
  } = {}
): string {
  const collab = collaborationOrigin(options.collaborationUrl);
  const dev = options.development === true;
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    "frame-ancestors": ["'self'"],
    "form-action": ["'self'", ...SIGN_IN_ORIGINS, CHECKOUT_ORIGIN],
    "script-src": [
      "'self'",
      "'unsafe-inline'",
      "'wasm-unsafe-eval'",
      // React Refresh evaluates code in development only.
      ...(dev ? ["'unsafe-eval'"] : []),
      UMAMI_ORIGIN,
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "media-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:"],
    "connect-src": [
      "'self'",
      UMAMI_ORIGIN,
      SENTRY_ORIGIN,
      ...(collab ? [collab] : []),
      // The dev server's hot-reload socket.
      ...(dev ? ["ws:"] : []),
    ],
    "worker-src": ["'self'", "blob:"],
    "frame-src": ["'self'"],
    "manifest-src": ["'self'"],
    "report-uri": [CSP_REPORT_PATH],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}
