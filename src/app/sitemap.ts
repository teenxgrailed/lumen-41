import type { MetadataRoute } from "next";

// The application host lists nothing: every page is noindex (middleware and
// metadata) and the public site with its pages lives on needt.app, which
// ships its own sitemap. The file exists so /sitemap.xml answers 200 with a
// valid, empty urlset to Search Console and crawlers instead of redirecting
// to sign-in (the middleware used to treat it as an app page).
export default function sitemap(): MetadataRoute.Sitemap {
  return [];
}
