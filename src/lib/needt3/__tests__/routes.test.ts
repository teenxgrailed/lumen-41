/**
 * /docs → /pages (permanent) and which 404 an unknown address gets.
 */
import { missingRouteFace } from "@/lib/needt3/not-found";

jest.mock("@sentry/nextjs", () => ({
  withSentryConfig: (c: unknown) => c,
}));

interface Redirect {
  source: string;
  destination: string;
  permanent: boolean;
}

describe("next.config redirects", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const config = require("../../../../next.config.js") as {
    redirects: () => Promise<Redirect[]>;
  };

  it("sends /docs and /docs/:id to /pages permanently", async () => {
    const list = await config.redirects();
    expect(list).toEqual(
      expect.arrayContaining([
        { source: "/docs", destination: "/pages", permanent: true },
        { source: "/docs/:id", destination: "/pages/:id", permanent: true },
      ])
    );
  });

  it("/pages/[id] exists for the redirect to land on", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs") as typeof import("fs");
    expect(fs.existsSync("src/app/(app)/pages/[id]/page.tsx")).toBe(true);
    expect(fs.existsSync("src/app/(app)/pages/page.tsx")).toBe(true);
  });
});

describe("missingRouteFace", () => {
  it("flag off: always the root not-found (unchanged)", () => {
    expect(missingRouteFace(["nope"], false)).toBe("root");
    expect(missingRouteFace(["a", "b"], false)).toBe("root");
  });

  it("flag on: the v3 face inside the shell", () => {
    expect(missingRouteFace(["nope"], true)).toBe("v3");
    expect(missingRouteFace(["projects", "x", "y"], true)).toBe("v3");
  });

  it("API and file-like paths keep the root 404 even with the flag on", () => {
    expect(missingRouteFace(["api", "nope"], true)).toBe("root");
    expect(missingRouteFace(["robots.txt"], true)).toBe("root");
    expect(missingRouteFace(["img", "logo.png"], true)).toBe("root");
    expect(missingRouteFace([], true)).toBe("root");
  });
});
