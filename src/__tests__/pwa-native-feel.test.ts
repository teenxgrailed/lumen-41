import { metadata, viewport } from "@/app/metadata";
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

  it("uses a translucent iOS status bar and a PNG touch icon", () => {
    expect(metadata.appleWebApp).toMatchObject({
      capable: true,
      statusBarStyle: "black-translucent",
    });
    expect(JSON.stringify(metadata.icons)).toContain("apple-touch-icon.png");
  });

  it("ships a standalone manifest with raster icons", () => {
    const m = JSON.parse(
      readFileSync(join(process.cwd(), "public/manifest.webmanifest"), "utf8")
    );
    expect(m.name).toBe(BRAND_LINE);
    expect(m.short_name).toBe("Needt");
    expect(m.display).toBe("standalone");
    expect(m.display_override[0]).toBe("standalone");
    expect(m.orientation).toBe("portrait-primary");
    expect(m.background_color).toBe(m.theme_color);
    expect(m.icons.some((i: { type: string }) => i.type === "image/png")).toBe(
      true
    );
  });
});
