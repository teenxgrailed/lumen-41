import { existsSync, statSync } from "node:fs";
import { join } from "node:path";

import { SOUNDS, isSound, soundOf, trackUrl } from "../focus";

describe("the focus sounds", () => {
  it("reads the old saved choices", () => {
    expect(soundOf("noise")).toBe("brown");
    expect(soundOf("rain")).toBe("off");
    expect(soundOf("cafe")).toBe("off");
    expect(soundOf(undefined)).toBe("off");
    expect(soundOf("pink")).toBe("pink");
    expect(isSound("noise")).toBe(false);
  });

  it("has a small file for every lo-fi track and none for the noises", () => {
    for (const s of SOUNDS) {
      const url = trackUrl(s);
      if (!s.startsWith("lofi-")) {
        expect(url).toBeNull();
        continue;
      }
      expect(url).toBe(`/focus-sounds/${s}.m4a`);
      const file = join(process.cwd(), "public", url as string);
      expect(existsSync(file)).toBe(true);
      // Lazy-loaded, but still small: under 1 MB each.
      expect(statSync(file).size).toBeLessThan(1_000_000);
    }
  });

  it("credits every track and says CC0", () => {
    const { readFileSync } =
      jest.requireActual<typeof import("node:fs")>("node:fs");
    const credits = readFileSync(
      join(process.cwd(), "public/focus-sounds/CREDITS.md"),
      "utf8"
    );
    for (const s of SOUNDS.filter((x) => x.startsWith("lofi-")))
      expect(credits).toContain(`${s}.m4a`);
    expect(credits).toMatch(/CC0/);
  });
});
