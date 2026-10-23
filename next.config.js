const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Keep the production build within constrained Docker Desktop memory.
    cpus: 1,
    viewTransition: true,
  },

  // Expose the package version to the client so the UI can display it.
  // package.json stays the single source of truth for the version.
  env: {
    NEXT_PUBLIC_APP_VERSION: require("./package.json").version,
  },

  // Disable all development indicators
  devIndicators: false,
  allowedDevOrigins: ["127.0.0.1"],

  // Lint and type-check are enforced pre-commit (husky/lint-staged) and in CI
  // via `npm run lint` / `npm run type-check`. Running them again inside
  // `next build` roughly doubles peak build memory and OOM-kills the Next build
  // worker on memory-constrained deploy hosts (Coolify). Skip them here so the
  // production image build only compiles.
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },

  // Standalone output is for Docker only. On Vercel it breaks the build
  // (missing route_client-reference-manifest.js for route-group API routes),
  // so skip it when building on Vercel.
  output: process.env.VERCEL ? undefined : "standalone",

  // Needt has one unified build with the standard Next.js extensions.
  pageExtensions: ["ts", "tsx", "js", "jsx"],

  // Keep runtime-oriented CommonJS packages outside route bundles. jsdom needs
  // its runtime assets, while googleapis pulls in a constant-time comparison
  // helper that patches Node's SlowBuffer prototype and cannot run against
  // webpack's browser Buffer shim during route page-data collection.
  // Standalone output still traces these dependencies into the image.
  serverExternalPackages: [
    "isomorphic-dompurify",
    "jsdom",
    "googleapis",
    "gaxios",
    "bullmq",
    "ioredis",
    // Native require caching keeps one constructor identity across server
    // route chunks; bundling Yjs per route triggers its duplicate-import guard.
    "yjs",
  ],

  // Documents live at /pages; /docs (the name people and old links use) was a
  // 404. Temporary (307), so /docs stays free for public API docs later.
  async redirects() {
    return [
      { source: "/docs", destination: "/pages", permanent: false },
      { source: "/docs/:id", destination: "/pages/:id", permanent: false },
    ];
  },

  // One headers() only: a second key in this object literal silently replaces
  // the first (the global X-Robots-Tag was lost that way).
  async headers() {
    return [
      {
        // The application is private; only the landing on needt.app is
        // indexable. middleware.ts sets the same header on every response too.
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      {
        // The OAuth consent page must never be framed (clickjacking).
        source: "/oauth/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          // same-origin, not no-referrer: no-referrer makes Chrome send
          // "Origin: null" on the consent POST, which the CSRF check refuses.
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
      {
        // The self-hosted design-system fonts never change under a given
        // name: each filename in public/fonts/ds/ carries a hash of its
        // content, so a changed font ships under a new URL. That makes a
        // year-long immutable cache safe. Scoped to /fonts/ds/ because the
        // other files under /fonts/ are not content-addressed and would be
        // served stale after a change.
        source: "/fonts/ds/:file*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

module.exports = withSentryConfig(nextConfig, {
  silent: true,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  release: {
    name: process.env.NEEDT_BUILD_SHA,
  },
  sourcemaps: {
    filesToDeleteAfterUpload: [".next/static/**/*.map"],
  },
  errorHandler(error) {
    throw error;
  },
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
});
