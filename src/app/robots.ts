import type { MetadataRoute } from "next";

// The application is private to signed-in people; the public site lives on
// needt.app. Nothing here may be indexed, and every response carries
// `X-Robots-Tag: noindex, nofollow`. So every page stays crawlable: a Disallow
// hides that noindex from Google, and a URL it already knows then stays in the
// index as "Indexed, though blocked by robots.txt" (Search Console, 2026-10-24).
// Only the API is kept out, to save crawl budget; it serves no pages.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: "/api/",
    },
  };
}
