import { newDateFromYMD } from "@/lib/date-utils";

import { hexToRgb, moodNameFor, pack, sceneIsDark } from "../sky-palette";

describe("sky moods", () => {
  it("picks one mood per local day, the same every call", () => {
    const d = newDateFromYMD(2026, 10, 10);
    expect(moodNameFor(d, false)).toBe(moodNameFor(d, false));
    expect(moodNameFor(d, true)).toBe(moodNameFor(d, true));
  });

  it("draws light moods from the light family and dark ones from the dark", () => {
    for (let day = 1; day <= 28; day++) {
      const d = newDateFromYMD(2026, 10, day);
      expect(["lavender", "rose", "periwinkle"]).toContain(
        moodNameFor(d, false)
      );
      expect(["night", "dusk"]).toContain(moodNameFor(d, true));
    }
  });

  it("varies over the month", () => {
    const names = new Set<string>();
    for (let day = 1; day <= 28; day++)
      names.add(moodNameFor(newDateFromYMD(2026, 10, day), false));
    expect(names.size).toBeGreaterThan(1);
  });
});

describe("colour helpers", () => {
  it("reads hex, with a grey fallback instead of a crash", () => {
    expect(hexToRgb("#a7b0d8")).toEqual([167, 176, 216]);
    expect(hexToRgb("#fff")).toEqual([255, 255, 255]);
    expect(hexToRgb("")).toEqual([128, 128, 128]);
    expect(hexToRgb("rgb(1,2,3)")).toEqual([128, 128, 128]);
  });

  it("packs an opaque pixel little-endian and clamps", () => {
    const px = pack(1, 2, 3) >>> 0;
    expect(px & 255).toBe(1);
    expect((px >> 8) & 255).toBe(2);
    expect((px >> 16) & 255).toBe(3);
    expect(px >>> 24).toBe(255);
    expect((pack(999, -5, 0) >>> 0) & 255).toBe(255);
  });
});

describe("sceneIsDark", () => {
  /** A chain of ancestors, nearest first, each with its data-theme (or none). */
  const chain = (...themes: (string | null)[]) => ({
    closest: (sel: string) => {
      expect(sel).toBe("[data-theme]");
      const t = themes.find((x) => x !== null);
      return t == null ? null : { getAttribute: () => t };
    },
  });

  it("reads the nearest theme scope", () => {
    expect(sceneIsDark(chain("dark") as never)).toBe(true);
    expect(sceneIsDark(chain("light") as never)).toBe(false);
  });

  it("does not walk past a light scope to a dark <html>", () => {
    // .needt-v3[data-theme=light] inside html[data-theme=dark]
    expect(sceneIsDark(chain("light", "dark") as never)).toBe(false);
  });

  it("is light with no scope at all", () => {
    expect(sceneIsDark(chain(null) as never)).toBe(false);
  });
});
