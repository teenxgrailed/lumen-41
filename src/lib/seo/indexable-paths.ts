/**
 * The only pages of the app host that Google may index: the legal documents.
 * Everything else on use.needt.app is private and stays `noindex, nofollow`
 * (middleware header, next.config.js header, root metadata).
 *
 * Owner decision 19.11.2026. /refund is not a page of the app: needt.app/refund
 * redirects to the refund section of /terms, so it is not listed.
 *
 * next.config.js repeats the two names in the source of its X-Robots-Tag rule
 * (it cannot import TypeScript); src/__tests__/robots.test.ts keeps them equal.
 */
export const APP_ORIGIN = "https://use.needt.app";

export const INDEXABLE_PATHS = ["/terms", "/privacy"] as const;

export function isIndexablePath(pathname: string): boolean {
  const bare =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;
  return (INDEXABLE_PATHS as readonly string[]).includes(bare);
}

/** The metadata of an indexable page: indexable, and its own canonical. */
export function indexablePageSeo(path: (typeof INDEXABLE_PATHS)[number]) {
  return {
    robots: { index: true, follow: true },
    alternates: { canonical: `${APP_ORIGIN}${path}` },
  } as const;
}
