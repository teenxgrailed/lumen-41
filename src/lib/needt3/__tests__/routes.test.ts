/**
 * /docs → /pages (temporary, 307) and which 404 an unknown address gets.
 */
import { launchActionOf } from "@/components/needt3/root/PwaBridge";

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

  it("sends /docs and /docs/:id to /pages, temporarily (307)", async () => {
    const list = await config.redirects();
    expect(list).toEqual(
      expect.arrayContaining([
        { source: "/docs", destination: "/pages", permanent: false },
        { source: "/docs/:id", destination: "/pages/:id", permanent: false },
      ])
    );
  });

  it("sends the retired pre-v3 screens to their v3 equivalents on Today", async () => {
    const list = await config.redirects();
    expect(list).toEqual(
      expect.arrayContaining([
        { source: "/chat", destination: "/today?launch=ask", permanent: false },
        { source: "/focus", destination: "/today", permanent: false },
        {
          source: "/quick-add",
          destination: "/today?launch=new-task",
          permanent: false,
        },
      ])
    );
    // the launch values are the ones PwaBridge opens
    for (const r of list.filter((x) => x.destination.includes("launch="))) {
      const search = r.destination.slice(r.destination.indexOf("?"));
      expect(launchActionOf(search)).not.toBeNull();
    }
    // a page left behind would never render, and would only mislead
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs") as typeof import("fs");
    for (const dir of ["chat", "focus", "quick-add"])
      expect(fs.existsSync(`src/app/(app)/${dir}`)).toBe(false);
  });

  it("/pages/[id] exists for the redirect to land on", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs") as typeof import("fs");
    expect(fs.existsSync("src/app/(app)/pages/[id]/page.tsx")).toBe(true);
    expect(fs.existsSync("src/app/(app)/pages/page.tsx")).toBe(true);
  });
});

describe("missingRouteFace", () => {
  it("signed out: always the root not-found", () => {
    expect(missingRouteFace(["nope"], false)).toBe("root");
    expect(missingRouteFace(["a", "b"], false)).toBe("root");
  });

  it("signed in: the face inside the shell", () => {
    expect(missingRouteFace(["nope"], true)).toBe("v3");
    expect(missingRouteFace(["projects", "x", "y"], true)).toBe("v3");
  });

  it("API and file-like paths keep the root 404 even when signed in", () => {
    expect(missingRouteFace(["api", "nope"], true)).toBe("root");
    expect(missingRouteFace(["robots.txt"], true)).toBe("root");
    expect(missingRouteFace(["img", "logo.png"], true)).toBe("root");
    expect(missingRouteFace([], true)).toBe("root");
  });
});
