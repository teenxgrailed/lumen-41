import { NextRequest } from "next/server";

import { metadata } from "@/app/metadata";
import { metadata as privacyMetadata } from "@/app/privacy/page";
import robots from "@/app/robots";
import sitemapRoute from "@/app/sitemap";
import { metadata as termsMetadata } from "@/app/terms/page";
import { middleware } from "@/middleware";

import { INDEXABLE_PATHS, isIndexablePath } from "@/lib/seo/indexable-paths";

// The terms page imports the session and flag code; only its metadata is read.
jest.mock("@/lib/auth/auth-options", () => ({ getAuthOptions: jest.fn() }));
jest.mock("@/lib/feature-flags", () => ({
  isFeatureEnabled: jest.fn(),
  isFeatureEnabledForEveryone: jest.fn(),
}));

jest.mock("@sentry/nextjs", () => ({
  withSentryConfig: (config: unknown) => config,
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const nextConfig = require("../../next.config.js") as {
  headers: () => Promise<
    { source: string; headers: { key: string; value: string }[] }[]
  >;
};

const LEGAL = ["/terms", "/privacy"];
const PRIVATE = [
  "/",
  "/auth/signin",
  "/today",
  "/start",
  "/calendar",
  "/login",
];

describe("robots.txt", () => {
  it("keeps the pages Google may know crawlable and closes the login-only ones", () => {
    const { rules, sitemap } = robots() as {
      rules: { userAgent: string; allow: string; disallow: string[] };
      sitemap: string;
    };
    expect(rules.userAgent).toBe("*");
    expect(rules.allow).toBe("/");
    expect(rules.disallow).toEqual(expect.arrayContaining(["/api/", "/tasks"]));
    for (const open of [
      "/",
      "/auth/signin",
      "/start",
      ...LEGAL,
      "/support",
      "/p/",
      "/b/",
      "/agents",
      "/settings",
    ]) {
      expect(rules.disallow.some((blocked) => open.startsWith(blocked))).toBe(
        false
      );
    }
    expect(sitemap).toBe("https://use.needt.app/sitemap.xml");
  });
});

describe("sitemap.xml", () => {
  it("lists exactly the indexable legal pages", () => {
    expect(sitemapRoute()).toEqual([
      { url: "https://use.needt.app/terms" },
      { url: "https://use.needt.app/privacy" },
    ]);
    expect([...INDEXABLE_PATHS]).toEqual(LEGAL);
  });
});

describe("test_legal_pages_are_indexable", () => {
  it.each(LEGAL)("%s has no noindex in the header", async (path) => {
    const response = await middleware(
      new NextRequest(`http://needt.test${path}`)
    );
    expect(response.headers.get("X-Robots-Tag")).toBeNull();
  });

  it.each([
    ["/terms", termsMetadata],
    ["/privacy", privacyMetadata],
  ] as const)(
    "%s has no noindex in the meta and a self canonical",
    (path, meta) => {
      expect(meta.robots).toEqual({ index: true, follow: true });
      expect(meta.alternates?.canonical).toBe(`https://use.needt.app${path}`);
    }
  );

  it("next.config.js leaves exactly /terms and /privacy out of the noindex rule", async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { match } = require("next/dist/compiled/path-to-regexp") as {
      match: (source: string) => (path: string) => unknown;
    };
    const rules = await nextConfig.headers();
    const noindex = rules.filter((rule) =>
      rule.headers.some((header) => header.key === "X-Robots-Tag")
    );
    expect(noindex).toHaveLength(1);
    const matches = match(noindex[0].source);
    for (const path of LEGAL) expect(matches(path)).toBe(false);
    for (const path of [
      ...PRIVATE,
      "/terms-of-use",
      "/privacy/extra",
      "/api/health",
      "/support",
    ]) {
      expect(matches(path)).not.toBe(false);
    }
  });

  it("isIndexablePath knows only the legal pages", () => {
    expect(LEGAL.every(isIndexablePath)).toBe(true);
    expect(isIndexablePath("/terms/")).toBe(true);
    expect(PRIVATE.some(isIndexablePath)).toBe(false);
  });
});

describe("test_app_pages_stay_noindex", () => {
  it("marks every other page noindex in metadata", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it.each([...PRIVATE, "/support", "/subprocessors", "/robots.txt"])(
    "sends X-Robots-Tag on %s",
    async (path) => {
      const response = await middleware(
        new NextRequest(`http://needt.test${path}`)
      );
      expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    }
  );
});
