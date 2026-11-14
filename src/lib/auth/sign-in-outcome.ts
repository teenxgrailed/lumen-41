/**
 * Whether a NextAuth credentials callback signed the person in, from what the
 * response says: a redirect (`location`) or, for `signIn(..., {redirect:false})`,
 * a JSON body `{ url }`. A refusal sends the browser to the sign-in page with an
 * `error` parameter; reading that parameter off the URL (not searching the text
 * for "error=") means a callbackUrl that happens to contain `error=` cannot be
 * mistaken for a refusal, or hide one.
 */
const REFUSAL_PATHS = new Set([
  "/auth/signin",
  "/api/auth/signin",
  "/api/auth/error",
]);

function refusesAt(target: unknown): boolean {
  if (typeof target !== "string" || !target) return false;
  try {
    const url = new URL(target, "http://localhost");
    return REFUSAL_PATHS.has(url.pathname) && url.searchParams.has("error");
  } catch {
    return false;
  }
}

export function signInSucceeded(input: {
  status: number;
  location?: string | null;
  body?: string | null;
}): boolean {
  if (input.status >= 400) return false;
  if (refusesAt(input.location)) return false;
  if (input.body) {
    try {
      const parsed = JSON.parse(input.body) as { url?: unknown };
      if (refusesAt(parsed?.url)) return false;
    } catch {
      /* not JSON: nothing more to read */
    }
  }
  return true;
}
