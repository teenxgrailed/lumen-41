import { INSTALL_HEAD, metadata, viewport } from "@/app/metadata";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { BRAND_LINE } from "@/lib/brand";

describe("PWA native feel", () => {
  it("locks zoom and goes edge to edge", () => {
    expect(viewport).toMatchObject({
      width: "device-width",
      initialScale: 1,
      maximumScale: 1,
      userScalable: false,
      viewportFit: "cover",
    });
    expect(Array.isArray(viewport.themeColor)).toBe(true);
  });

  it("uses a translucent iOS status bar, the install name and a PNG touch icon", () => {
    const meta = Object.fromEntries(
      INSTALL_HEAD.meta.map((m) => [m.name, m.content])
    );
    expect(meta).toMatchObject({
      "apple-mobile-web-app-capable": "yes",
      "mobile-web-app-capable": "yes",
      "apple-mobile-web-app-title": "Needt",
      "apple-mobile-web-app-status-bar-style": "black-translucent",
    });
    expect(INSTALL_HEAD.manifest).toBe("/manifest.webmanifest");
    expect(INSTALL_HEAD.appleTouchIcon.href).toContain("apple-touch-icon.png");
  });

  it("keeps the install tags out of the streamed metadata", () => {
    // Next streams `metadata` into <body> for browsers; a second copy there
    // is what iOS can read instead of the one in <head>
    expect(metadata.manifest).toBeUndefined();
    expect(metadata.appleWebApp).toBeUndefined();
    expect(metadata.other).toBeUndefined();
    expect(JSON.stringify(metadata.icons)).not.toContain("apple-touch-icon");
    const layout = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");
    expect(layout).toContain("INSTALL_HEAD.manifest");
    expect(layout).toContain("INSTALL_HEAD.meta.map");
  });

  it("ships a standalone manifest with raster icons", () => {
    const m = JSON.parse(
      readFileSync(join(process.cwd(), "public/manifest.webmanifest"), "utf8")
    );
    expect(m.name).toBe(BRAND_LINE);
    expect(m.short_name).toBe("Needt");
    expect(m.display).toBe("standalone");
    // minimal-ui would let iOS 26 wrap the app in the Safari controller
    expect(m.display_override).toEqual(["standalone"]);
    // the entry URL and the id sit inside the scope: leaving it is what makes
    // iOS show the in-app browser bar
    expect(m.scope).toBe("/");
    expect(m.start_url.startsWith(m.scope)).toBe(true);
    expect(m.id.startsWith(m.scope)).toBe(true);
    expect(m.start_url).not.toMatch(/^https?:/);
    expect(m.orientation).toBe("portrait-primary");
    expect(m.background_color).toBe(m.theme_color);
    expect(m.icons.some((i: { type: string }) => i.type === "image/png")).toBe(
      true
    );
  });
});
