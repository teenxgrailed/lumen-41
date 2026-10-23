/**
 * next.config.js once had two `headers()` keys in one object literal; the
 * later one won and the global X-Robots-Tag disappeared. This loads the real
 * config and checks that every header rule is still served.
 */
import { readFileSync } from "fs";
import path from "path";

jest.mock("@sentry/nextjs", () => ({
  withSentryConfig: (config: unknown) => config,
}));

type HeaderRule = {
  source: string;
  headers: Array<{ key: string; value: string }>;
};

const configPath = path.join(process.cwd(), "next.config.js");

// eslint-disable-next-line @typescript-eslint/no-require-imports
const nextConfig = require(configPath) as {
  headers: () => Promise<HeaderRule[]>;
};

function headerFor(rules: HeaderRule[], source: string, key: string) {
  return rules
    .find((rule) => rule.source === source)
    ?.headers.find((header) => header.key === key)?.value;
}

describe("next.config.js headers()", () => {
  it("is defined exactly once in the source", () => {
    const source = readFileSync(configPath, "utf8");
    expect(source.match(/async headers\(\)/g)).toHaveLength(1);
  });

  it("keeps the global noindex, the OAuth framing guard and the font cache", async () => {
    const rules = await nextConfig.headers();
    expect(rules.map((rule) => rule.source)).toEqual([
      "/:path*",
      "/oauth/:path*",
      "/fonts/ds/:file*",
    ]);
    expect(headerFor(rules, "/:path*", "X-Robots-Tag")).toBe(
      "noindex, nofollow"
    );
    expect(headerFor(rules, "/oauth/:path*", "X-Frame-Options")).toBe("DENY");
    expect(headerFor(rules, "/oauth/:path*", "Content-Security-Policy")).toBe(
      "frame-ancestors 'none'"
    );
    expect(headerFor(rules, "/oauth/:path*", "Referrer-Policy")).toBe(
      "same-origin"
    );
    expect(headerFor(rules, "/fonts/ds/:file*", "Cache-Control")).toBe(
      "public, max-age=31536000, immutable"
    );
  });
});
