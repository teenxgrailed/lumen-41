/**
 * Redirect URI rules (OAuth 2.1 §4.1.1, RFC 8252 §7.3):
 * - https anywhere, or http only on a loopback address;
 * - no fragment, no credentials;
 * - compared exactly, except that a loopback redirect matches any port,
 *   because native clients (Claude Code) bind an ephemeral one.
 */

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "[::1]", "localhost"]);

function parse(uri: string): URL | null {
  try {
    return new URL(uri);
  } catch {
    return null;
  }
}

export function isLoopbackRedirect(url: URL): boolean {
  return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
}

/** Whether a client may register (or list in its metadata) this URI. */
export function isAllowedRedirectUri(uri: string): boolean {
  const url = parse(uri);
  if (!url || url.hash || url.username || url.password) return false;
  if (url.protocol === "https:") return true;
  return isLoopbackRedirect(url);
}

/** Whether a requested redirect_uri is one of the registered ones. */
export function matchesRegisteredRedirect(
  requested: string,
  registered: readonly string[]
): boolean {
  const asked = parse(requested);
  if (!asked || !isAllowedRedirectUri(requested)) return false;
  return registered.some((candidate) => {
    if (candidate === requested) return true;
    const known = parse(candidate);
    if (!known || !isLoopbackRedirect(known) || !isLoopbackRedirect(asked)) {
      return false;
    }
    return (
      known.hostname === asked.hostname &&
      known.pathname === asked.pathname &&
      known.search === asked.search
    );
  });
}
