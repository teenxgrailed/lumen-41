type PublicUrlRequest = {
  nextUrl: {
    pathname: string;
    search: string;
  };
  url: string;
  headers?: { get(name: string): string | null };
};

function isLocalHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".test")
  );
}

/**
 * The origin of a URL, always https unless it is a local development host. An
 * installed iOS home-screen app treats a redirect to http:// as leaving the
 * app and wraps it in the Safari controller, so a misconfigured http
 * NEXTAUTH_URL (or forwarded proto) must never reach a Location header.
 */
function originOf(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol === "http:" && !isLocalHost(url.hostname)) {
      url.protocol = "https:";
    }
    return url.origin;
  } catch {
    return null;
  }
}

function configuredPublicOrigin(): string | null {
  return (
    originOf(process.env.NEXTAUTH_URL) ??
    originOf(process.env.NEXT_PUBLIC_APP_URL)
  );
}

function forwardedOrigin(request: PublicUrlRequest): string | null {
  const host = request.headers?.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (!host) return null;
  const proto =
    request.headers?.get("x-forwarded-proto")?.split(",")[0]?.trim() || "https";
  return originOf(`${proto}://${host}`);
}

/**
 * Builds redirects from the configured public application origin while
 * preserving only the request path. Reverse proxies may expose an internal
 * container hostname through request.url, which must never reach callbacks.
 */
export function publicRequestUrl(request: PublicUrlRequest): URL {
  const origin =
    configuredPublicOrigin() ??
    forwardedOrigin(request) ??
    new URL(request.url).origin;
  return new URL(
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
    origin
  );
}

export function publicAppUrl(pathname: string, request: PublicUrlRequest): URL {
  return new URL(pathname, publicRequestUrl(request).origin);
}
