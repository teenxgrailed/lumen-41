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
  "#2fb5a3", // teal
  "#3fae6a", // green
  "#d99a2b", // amber
  "#e07a3f", // orange
  "#d65fa3", // pink
  "#4cb0d6", // sky
  "#9bb02f", // lime
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

/** Saturation (0-1) of "#rgb" / "#rrggbb"; null when it is not one. */
function hexSaturation(hex: string): number | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const full =
    m[1].length === 3
      ? m[1]
          .split("")
          .map((c) => c + c)
          .join("")
      : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

/** Whether a stored colour reads as grey (or as nothing). */
export function isGreyColor(color: string | null | undefined): boolean {
  if (!color || !color.trim()) return true;
  const c = color.trim();
  if (GREY_WORDS.test(c) || GREY_VARS.test(c)) return true;
  const s = hexSaturation(c);
  return s !== null && s < 0.16;
}

/** What a project draws in: its own colour, unless that is none or grey. */
export function projectColor(
  id: string,
  color: string | null | undefined
): string {
  return isGreyColor(color) ? paletteColor(id) : (color as string);
}
