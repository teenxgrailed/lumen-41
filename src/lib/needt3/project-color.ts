/**
 * A project never renders grey. Grey is what a meeting is (an event wears the
 * tertiary text colour); a project that has no colour of its own, or one that
 * reads as grey, takes a palette colour chosen by its id, so the same project
 * is the same colour on every screen and every load.
 *
 * The palette has no grey and no alarm red (red is the now line and the
 * destructive actions).
 */
export const PROJECT_PALETTE = [
  "#5b8def", // blue
  "#8b6cf0", // violet
  "#1f9a8a", // teal
  "#2e9d5b", // green
  "#b8780f", // amber
  "#d1622a", // orange
  "#d65fa3", // pink
  "#2a93bd", // sky
  "#7d8f14", // lime
  "#b56cd0", // orchid
] as const;

/** FNV-1a: small, stable across runtimes, spreads short ids well. */
function hash(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** The palette colour of a project id. */
export function paletteColor(id: string): string {
  return PROJECT_PALETTE[hash(id) % PROJECT_PALETTE.length];
}

/** Colour words and variables that mean "no colour of its own". */
const GREY_WORDS =
  /^(gr[ae]y|silver|slate|zinc|neutral|stone|gainsboro|lightgr[ae]y|darkgr[ae]y|dimgr[ae]y|transparent|currentcolor|inherit)$/i;
const GREY_VARS = /^var\(--(text|fill|border|surface|v2p-ink|ink)\b/i;

/** The five colours a person can pick for a project (work/model.ts PROJECT_SWATCHES). */
const SWATCH_VALUES: ReadonlySet<string> = new Set([
  "var(--accent)",
  "var(--info)",
  "var(--success)",
  "var(--destructive)",
  "var(--text-muted)",
]);

/** Saturation (0-1) of "#rgb" / "#rrggbb" / rgb() / hsl(); null when it is none of them. */
function saturation(color: string): number | null {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color);
  let r: number, g: number, b: number;
  if (hex) {
    const full =
      hex[1].length === 3
        ? hex[1]
            .split("")
            .map((c) => c + c)
            .join("")
        : hex[1];
    [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  } else {
    const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(color);
    if (rgb) [r, g, b] = [+rgb[1], +rgb[2], +rgb[3]];
    else {
      const hsl = /^hsla?\(\s*[\d.]+(?:deg)?[\s,]+([\d.]+)%/i.exec(color);
      return hsl ? Number(hsl[1]) / 100 : null;
    }
  }
  const max = Math.max(r, g, b);
  return max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
}

/**
 * Whether a stored colour is nothing, or a grey the person never picked from
 * the swatches (a stray hex, a text variable). The five swatches are
 * deliberate, Muted included, and are never replaced.
 */
export function isGreyColor(color: string | null | undefined): boolean {
  if (!color || !color.trim()) return true;
  const c = color.trim();
  if (SWATCH_VALUES.has(c)) return false;
  if (GREY_WORDS.test(c) || GREY_VARS.test(c)) return true;
  const s = saturation(c);
  return s !== null && s < 0.16;
}

/**
 * What a project DRAWS in: its own colour, unless that is empty or a stray
 * grey. Render-time only: the stored colour is never replaced by this, so
 * editing, renaming and undo keep what the person set.
 */
export function projectColor(
  id: string,
  color: string | null | undefined
): string {
  return isGreyColor(color) ? paletteColor(id) : (color as string);
}
