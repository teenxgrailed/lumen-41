/**
 * A stand-in for Google's OAuth endpoints, for the end-to-end suite only. With
 * `NEEDT_E2E_OAUTH_URL` set, the `google` sign-in provider keeps its id (so
 * the real button, callback route and `signIn` gates run) but talks to a mock
 * identity provider at that address. Like `NEEDT_SIGNUPS_OPEN`, it works only
 * outside production or under CI, so a stray variable on the server can never
 * point sign-in at somebody else's endpoint.
 */
export function e2eOAuthBase(): string | null {
  const base = process.env.NEEDT_E2E_OAUTH_URL?.trim();
  if (!base) return null;
  if (process.env.NODE_ENV === "production" && process.env.CI !== "true") {
    return null;
  }
  return base.replace(/\/+$/, "");
}
