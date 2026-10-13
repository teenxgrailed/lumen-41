import type { MetadataRoute } from "next";

// The application is private to signed-in people; the public site lives on
// needt.app. Nothing here should be indexed.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
