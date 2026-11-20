import { PROJECT_SWATCHES } from "@/components/needt3/work/model";

import { previousFields } from "../hooks/core";
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

/** WCAG contrast of a hex against white. */
const contrastOnWhite = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05);
};

describe("palette contrast", () => {
  it("every colour reaches 3:1 on a light surface (rails and dots)", () => {
    for (const c of PROJECT_PALETTE)
      expect(contrastOnWhite(c)).toBeGreaterThanOrEqual(3);
  });
});

describe("projectColor: a project never RENDERS grey", () => {
  it("falls back to a palette colour when there is none", () => {
    for (const none of [null, undefined, "", "   "]) {
      expect(PROJECT_PALETTE).toContain(projectColor("home", none));
    }
  });
  it("replaces a stray grey of any shape", () => {
    for (const grey of [
      "#888",
      "#808080",
      "#9ca3af",
      "#cccccc",
      "gray",
      "Grey",
      "rgb(128, 128, 128)",
      "rgba(150 150 150 / 0.5)",
      "hsl(0, 0%, 50%)",
      "var(--text-tertiary)",
      "var(--fill-4)",
    ]) {
      expect(isGreyColor(grey)).toBe(true);
      expect(PROJECT_PALETTE).toContain(projectColor("launch", grey));
    }
  });
  it("never replaces one of the five swatches, Muted included", () => {
    for (const [, value] of PROJECT_SWATCHES)
      expect(projectColor("x", value)).toBe(value);
    expect(projectColor("x", "var(--text-muted)")).toBe("var(--text-muted)");
  });
  it("keeps a colour the person chose", () => {
    expect(projectColor("x", "#e11d48")).toBe("#e11d48");
    expect(projectColor("x", "rgb(37, 99, 235)")).toBe("rgb(37, 99, 235)");
    expect(projectColor("x", "hsl(220, 80%, 50%)")).toBe("hsl(220, 80%, 50%)");
  });
});

describe("the stored colour is never written over", () => {
  it("projectFromApi keeps null as null and a stray grey as it was", () => {
    expect(
      projectFromApi({ id: "home", name: "Home", color: null }).color
    ).toBe(null);
    expect(projectFromApi({ id: "l", name: "L", color: "#999999" }).color).toBe(
      "#999999"
    );
  });
  it("a rename's undo inverse restores the raw colour, null included", () => {
    const cur = projectFromApi({ id: "home", name: "Home", color: null });
    expect(previousFields(cur, { name: "House" })).toEqual({ name: "Home" });
    // recolouring then undoing puts back null, not a palette colour
    expect(previousFields(cur, { color: "var(--info)" })).toEqual({
      color: null,
    });
  });
  it("what a rename saves carries no colour of its own making", () => {
    const cur = projectFromApi({ id: "home", name: "Home", color: null });
    // the edit form seeds from the raw colour; only the swatch fallback applies
    expect(cur.color || PROJECT_SWATCHES[0][1]).toBe("var(--accent)");
    expect(PROJECT_PALETTE).not.toContain(cur.color);
  });
});
