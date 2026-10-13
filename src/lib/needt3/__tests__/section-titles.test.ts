import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { PLACES } from "@/components/needt3/shell/places";

import { getTitleFromPathname } from "@/lib/utils/page-title";

import { SECTION_TITLES, itemTitle, sectionMetadata } from "../section-titles";

const APP_DIR = join(process.cwd(), "src/app/(app)");

function routeDirs(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (!statSync(full).isDirectory()) continue;
    out.push(...routeDirs(full));
  }
  if (existsSync(join(dir, "page.tsx"))) out.push(dir);
  return out;
}

describe("tab titles", () => {
  it("name each sidebar place exactly as the sidebar does", () => {
    for (const place of PLACES) {
      expect(SECTION_TITLES[place.id]).toBe(place.label);
    }
    expect(SECTION_TITLES.today).toBe("Home");
    expect(SECTION_TITLES.docs).toBe("Docs");
    expect(SECTION_TITLES.mail).toBe("Mailbox");
  });

  it("are the section name alone, with no product suffix", () => {
    for (const title of Object.values(SECTION_TITLES)) {
      expect(title).not.toMatch(/needt/i);
      expect(title).not.toMatch(/[|·]/);
    }
    expect(sectionMetadata("calendar")).toEqual({ title: "Calendar" });
  });

  it("use an item's own name, else the section's", () => {
    expect(itemTitle("  Q3 plan ", "docs")).toBe("Q3 plan");
    expect(itemTitle("", "docs")).toBe("Docs");
    expect(itemTitle(null, "moodboards")).toBe("Moodboards");
  });

  it("are the same in the legacy shell's route-driven title", () => {
    expect(getTitleFromPathname("/calendar")).toBe("Calendar");
    expect(getTitleFromPathname("/auth/signin")).toBe("Sign in");
    expect(getTitleFromPathname("/pages/abc")).toBeNull();
  });

  it("are declared by every route of the app, as metadata or a layout", () => {
    const missing: string[] = [];
    for (const dir of routeDirs(APP_DIR)) {
      const page = readFileSync(join(dir, "page.tsx"), "utf8");
      const layoutPath = join(dir, "layout.tsx");
      const layout = existsSync(layoutPath)
        ? readFileSync(layoutPath, "utf8")
        : "";
      const declared = /\bmetadata\b|generateMetadata/;
      // Redirect-only routes never render, so they need no title.
      const redirectOnly = /^\s*redirect\(/m.test(page) && !/<\w/.test(page);
      if (!declared.test(page) && !declared.test(layout) && !redirectOnly) {
        missing.push(dir.replace(APP_DIR, ""));
      }
    }
    expect(missing).toEqual([]);
  });

  it("never carry the product name in a route's own title", () => {
    const offenders: string[] = [];
    const scan = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) scan(full);
        else if (/^(page|layout)\.tsx$/.test(name)) {
          const src = readFileSync(full, "utf8");
          if (/title:\s*[`"'][^`"']*(Needt|\$\{APP_NAME\})/.test(src))
            offenders.push(full.replace(APP_DIR, ""));
        }
      }
    };
    scan(APP_DIR);
    expect(offenders).toEqual([]);
  });
});

describe("app icon", () => {
  const read = (p: string) => readFileSync(join(process.cwd(), p));

  it("is the dark tile everywhere the app declares one", () => {
    const svg = read("public/brand/needt-icon.svg").toString("utf8");
    expect(svg).toContain("#17162b");
    expect(
      existsSync(join(process.cwd(), "public/brand/needt-icon-dark.svg"))
    ).toBe(false);
  });

  it("ships PNGs at the sizes the manifest and metadata promise", () => {
    const size = (p: string) => {
      const b = read(p);
      return [b.readUInt32BE(16), b.readUInt32BE(20)];
    };
    expect(size("public/icons/icon-192.png")).toEqual([192, 192]);
    expect(size("public/icons/icon-512.png")).toEqual([512, 512]);
    expect(size("public/icons/icon-maskable-192.png")).toEqual([192, 192]);
    expect(size("public/icons/icon-maskable-512.png")).toEqual([512, 512]);
    expect(size("public/icons/apple-touch-icon.png")).toEqual([180, 180]);
    expect(size("public/icons/favicon-32.png")).toEqual([32, 32]);
    expect(size("public/icons/favicon-16.png")).toEqual([16, 16]);
  });
});
