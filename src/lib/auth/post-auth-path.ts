import { safeCallbackPath } from "@/lib/auth/callback-url";

/**
 * Where a deep link was going when sign-in interrupted it (the landing's
 * `/settings?section=billing&checkout=pro-year`). Credentials sign-in carries
 * the callbackUrl by itself; the three detours that drop it are an OAuth
 * sign-up (NextAuth sends a new account to /setup), the first-run setup, and
 * the email-confirmation page. The sign-in screen leaves the path in a
 * short-lived cookie and whichever of those finishes first takes it, once.
 *
 * The cookie only ever holds a local path (`safeCallbackPath`), and is read
 * back through the same check, so it cannot become an open redirect.
 */
export const POST_AUTH_COOKIE = "needt-post-auth";
const MAX_AGE_SECONDS = 60 * 60;
const DEFAULT_PATH = safeCallbackPath(null);

type CookieJar = { cookie: string };

function worthKeeping(path: string): boolean {
  return (
    path !== DEFAULT_PATH &&
    !path.startsWith("/auth/") &&
    !path.startsWith("/setup")
  );
}

/** Remember a callbackUrl across the sign-up detours; ignores the default. */
export function rememberPostAuthPath(
  callbackUrl: string | null | undefined,
  jar: CookieJar = document
): void {
  const path = safeCallbackPath(callbackUrl);
  if (!worthKeeping(path)) return;
  const secure =
    typeof location !== "undefined" && location.protocol === "https:"
      ? "; Secure"
      : "";
  jar.cookie = `${POST_AUTH_COOKIE}=${encodeURIComponent(path)}; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

/** The remembered path, cleared as it is read; null when there is none. */
export function takePostAuthPath(jar: CookieJar = document): string | null {
  const entry = jar.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${POST_AUTH_COOKIE}=`));
  if (!entry) return null;
  jar.cookie = `${POST_AUTH_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  let value: string;
  try {
    value = decodeURIComponent(entry.slice(POST_AUTH_COOKIE.length + 1));
  } catch {
    return null;
  }
  const path = safeCallbackPath(value);
  return worthKeeping(path) ? path : null;
}
