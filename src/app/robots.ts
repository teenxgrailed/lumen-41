import type { MetadataRoute } from "next";

// The application is private to signed-in people; the public site lives on
// needt.app. Nothing here may be indexed, and every response carries
// `X-Robots-Tag: noindex, nofollow`.
//
// Pages Google may already know (/, /auth/*, /privacy, /terms, /support, /p/,
// /b/, /start, and /agents and /settings, which needt.app links to) stay
// crawlable: a Disallow would hide their noindex, and a URL Google already
// knows then stays in the index as "Indexed, though blocked by robots.txt"
// (Search Console, 2026-10-24).
//
// The login-only screens below were never public and nothing links to them,
// so Google has no URL to drop; keeping crawlers out saves crawl budget and
// stops them filling "Discovered - currently not indexed" with sign-in
// redirects. The API serves no pages either.
export const PRIVATE_APP_PATHS = [
  "/api/",
  "/admin",
  "/boards",
  "/budget",
  "/calendar",
  "/connections",
  "/goals",
  "/habits",
  "/learn",
  "/logs",
  "/mail",
  "/moodboards",
  "/pages",
  "/projects",
  "/share",
  "/tasks",
  "/templates",
  "/today",
  "/trash",
] as const;

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [...PRIVATE_APP_PATHS],
    },
    sitemap: "https://use.needt.app/sitemap.xml",
  };
}
