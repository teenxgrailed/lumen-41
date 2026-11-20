import type { MetadataRoute } from "next";

import { APP_ORIGIN, INDEXABLE_PATHS } from "@/lib/seo/indexable-paths";

// The app host lists only its indexable pages, the legal documents. Every
// other page is noindex (middleware, next.config.js and metadata) and the
// public site lives on needt.app with its own sitemap. This URL is public:
// the middleware lets /sitemap.xml through without a session.
export default function sitemap(): MetadataRoute.Sitemap {
  return INDEXABLE_PATHS.map((path) => ({ url: `${APP_ORIGIN}${path}` }));
}
