import { projectFromApi } from "../map";
import {
  PROJECT_PALETTE,
  isGreyColor,
  paletteColor,
  projectColor,
} from "../project-color";

/** Saturation of a palette hex, 0-1. */
const sat = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const max = Math.max(r, g, b);
  return max ? (max - Math.min(r, g, b)) / max : 0;
};
const hue = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (!d) return 0;
  const h =
    max === r
      ? ((g - b) / d) % 6
      : max === g
        ? (b - r) / d + 2
        : (r - g) / d + 4;
  return Math.round(((h * 60 + 360) % 360) * 10) / 10;
};

describe("the project palette", () => {
  it("has no grey in it", () => {
    for (const c of PROJECT_PALETTE) {
      expect(sat(c)).toBeGreaterThan(0.4);
      expect(isGreyColor(c)).toBe(false);
    }
  });
  it("has no alarm red in it", () => {
    for (const c of PROJECT_PALETTE) {
      const h = hue(c);
      expect(h > 345 || h < 12).toBe(false);
    }
  });
  it("gives one colour per id, the same every time", () => {
    expect(paletteColor("proj_home")).toBe(paletteColor("proj_home"));
    const used = new Set(
      Array.from({ length: 60 }, (_, i) => paletteColor(`p${i}`))
    );
    expect(used.size).toBeGreaterThan(5);
  });
});

describe("projectColor: a project never renders grey", () => {
  it("falls back to a palette colour when there is none", () => {
    for (const none of [null, undefined, "", "   "]) {
      expect(PROJECT_PALETTE).toContain(projectColor("home", none));
    }
  });
  it("replaces every shape of grey", () => {
    for (const grey of [
      "#888",
      "#808080",
      "#9ca3af",
      "#cccccc",
      "gray",
      "Grey",
      "var(--text-tertiary)",
      "var(--text-muted)",
      "var(--fill-4)",
    ]) {
      expect(isGreyColor(grey)).toBe(true);
      expect(PROJECT_PALETTE).toContain(projectColor("launch", grey));
    }
  });
  it("keeps a colour the person chose", () => {
    expect(projectColor("x", "#e11d48")).toBe("#e11d48");
    expect(projectColor("x", "#5b8def")).toBe("#5b8def");
    expect(projectColor("x", "var(--accent)")).toBe("var(--accent)");
  });
  it("is what every screen reads: projectFromApi never returns grey or null", () => {
    const home = projectFromApi({ id: "home", name: "Home", color: null });
    const launch = projectFromApi({
      id: "launch",
      name: "Product launch",
      color: "#999999",
    });
    const chosen = projectFromApi({ id: "c", name: "C", color: "#2563eb" });
    expect(PROJECT_PALETTE).toContain(home.color);
    expect(PROJECT_PALETTE).toContain(launch.color);
    expect(chosen.color).toBe("#2563eb");
    expect(home.color).toBe(projectFromApi({ id: "home", name: "x" }).color);
  });
});
