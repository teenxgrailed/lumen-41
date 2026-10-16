import type { MetadataRoute } from "next";

// The application is private to signed-in people; the public site lives on
// needt.app. Nothing here may be indexed, but the public entry pages stay
// crawlable so Google can see their noindex (a blanket Disallow would hide it
// and leave already-indexed URLs in results) and so OAuth verification can
// read /privacy and /terms. Every response also carries X-Robots-Tag.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/$", "/auth/", "/privacy", "/terms", "/subprocessors"],
      disallow: "/",
    },
  };
}
