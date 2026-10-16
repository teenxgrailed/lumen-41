import { NextRequest } from "next/server";

import { metadata } from "@/app/metadata";
import robots from "@/app/robots";
import { middleware } from "@/middleware";

describe("robots.txt", () => {
  it("keeps public entry pages crawlable and everything else disallowed", () => {
    expect(robots()).toEqual({
      rules: {
        userAgent: "*",
        allow: ["/$", "/auth/", "/privacy", "/terms", "/subprocessors"],
        disallow: "/",
      },
    });
  });

  it("marks every page noindex in metadata", () => {
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });

  it.each(["/auth/signin", "/privacy", "/robots.txt", "/calendar", "/login"])(
    "sends X-Robots-Tag on %s",
    async (path) => {
      const response = await middleware(
        new NextRequest(`http://needt.test${path}`)
      );
      expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow");
    }
  );
});
