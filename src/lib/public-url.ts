type PublicUrlRequest = {
  nextUrl: {
    pathname: string;
    search: string;
  };
  url: string;
  headers?: { get(name: string): string | null };
};

function originOf(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    return new URL(value.trim()).origin;
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
