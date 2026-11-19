import { NextRequest } from "next/server";

import { metadata } from "@/app/metadata";
import robots from "@/app/robots";
import sitemapRoute from "@/app/sitemap";
import { middleware } from "@/middleware";

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
      "/privacy",
      "/terms",
      "/support",
      "/p/",
      "/b/",
      "/start",
      "/agents",
      "/settings",
    ]) {
      expect(rules.disallow.some((blocked) => open.startsWith(blocked))).toBe(
        false
      );
    }
    expect(sitemap).toBe("https://use.needt.app/sitemap.xml");
  });

  it("serves an empty, valid sitemap", () => {
    expect(sitemapRoute()).toEqual([]);
  });

  it("marks every page noindex in metadata", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it.each([
    "/auth/signin",
    "/privacy",
    "/robots.txt",
    "/sitemap.xml",
    "/calendar",
    "/login",
  ])("sends X-Robots-Tag on %s", async (path) => {
    const response = await middleware(
      new NextRequest(`http://needt.test${path}`)
    );
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
  });
});
