/**
 * The sky's moods (prototype scenes.jsx, "Moods").
 *
 * Mood colours are tokens in `src/styles/v3/themes.css` (`--sky-*`), read once
 * from the sky's own element. One mood per local day and theme family: light
 * moods are lavender (the default look), rose and periwinkle; dark ones are
 * night and dusk. A page without the tokens gets a flat grey sky, not a crash.
 */
import { newDate } from "@/lib/date-utils";

export type Rgb = number[];

export interface Mood {
  name: string;
  night: boolean;
  top: Rgb;
  mid: Rgb;
  low: Rgb;
  sun: Rgb;
  lit: Rgb;
  shade: Rgb;
  dot: Rgb;
  ridge: Rgb;
  sunA: number;
  sunX: number;
  sunY: number;
  cover: number;
}

export interface Palette extends Mood {
  dark: boolean;
}

interface MoodSpec {
  sunA: number;
  sunX: number;
  sunY: number;
  cover: number;
  stars?: 1;
}

const SPECS: Record<string, MoodSpec> = {
  lavender: { sunA: 0.25, sunX: 0.7, sunY: 0.12, cover: 0 },
  rose: { sunA: 0.28, sunX: 0.24, sunY: 0.14, cover: 0 },
  periwinkle: { sunA: 0.22, sunX: 0.8, sunY: 0.08, cover: 0 },
  night: { sunA: 0.1, sunX: 0.78, sunY: 0.14, cover: -0.03, stars: 1 },
  dusk: { sunA: 0.12, sunX: 0.24, sunY: 0.7, cover: -0.02, stars: 1 },
};

/** Old names (pins) map onto the current set. */
export const MOOD_ALIAS: Record<string, string> = {
  lilac: "lavender",
  mist: "lavender",
  candy: "rose",
  sunset: "rose",
  gold: "rose",
  golden: "rose",
  day: "periwinkle",
  clear: "periwinkle",
  summer: "periwinkle",
  haze: "periwinkle",
  silver: "periwinkle",
  overcast: "periwinkle",
  aqua: "periwinkle",
  teal: "periwinkle",
  evening: "night",
  moonlit: "night",
  harbor: "night",
  indigo: "night",
  slate: "dusk",
};

const LIGHT = ["lavender", "lavender", "rose", "periwinkle"];
const DARK = ["night", "night", "dusk"];

export function hexToRgb(h: string): Rgb {
  if (!h || h.charAt(0) !== "#") return [128, 128, 128];
  let s = h.slice(1);
  if (s.length === 3) s = s.replace(/./g, (c) => c + c);
  const n = parseInt(s.slice(0, 6), 16);
  if (Number.isNaN(n)) return [128, 128, 128];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const lerp3 = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

export const smooth = (t: number): number => {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
};

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : (v + 0.5) | 0);

/**
 * Opaque RGBA packed for an Int32 view (little-endian), rounded and clamped.
 * Signed on purpose: an opaque colour is then a small integer, never a boxed
 * heap number when it is returned from a function.
 */
export const pack = (r: number, g: number, b: number): number =>
  0xff000000 | (clamp255(b) << 16) | (clamp255(g) << 8) | clamp255(r);

export const cssRgb = (c: Rgb): string =>
  "rgb(" + c.map(Math.round).join(",") + ")";

/** Read every mood from the `--sky-<mood>-*` tokens visible from `el`. */
export function readMoodTable(el: Element): Record<string, Mood> {
  const cs = getComputedStyle(el);
  const tok = (n: string) => cs.getPropertyValue(n).trim();
  const out: Record<string, Mood> = {};
  for (const name of Object.keys(SPECS)) {
    const s = SPECS[name];
    const k = (f: string) => hexToRgb(tok(`--sky-${name}-${f}`));
    out[name] = {
      name,
      night: !!s.stars,
      top: k("top"),
      mid: k("mid"),
      low: k("low"),
      sun: k("sun"),
      lit: k("lit"),
      shade: k("shade"),
      dot: k("dot"),
      ridge: k("ridge"),
      sunA: s.sunA,
      sunX: s.sunX,
      sunY: s.sunY,
      cover: s.cover,
    };
  }
  return out;
}

/** YYYYMMDD of the local date. */
export function dayKey(date: Date): number {
  return (
    date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate()
  );
}

/** One mood per local day and theme family. */
export function moodNameFor(date: Date, dark: boolean): string {
  const list = dark ? DARK : LIGHT;
  let h = (dayKey(date) * 2654435761 + (dark ? 97 : 13)) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 3266489909) >>> 0;
  h ^= h >>> 16;
  return list[(h >>> 0) % list.length];
}

export function paletteFor(
  table: Record<string, Mood>,
  dark: boolean,
  pin?: string,
  date: Date = newDate()
): Palette {
  const pinned = pin ? (MOOD_ALIAS[pin] ?? pin) : undefined;
  const name = pinned && table[pinned] ? pinned : moodNameFor(date, dark);
  return { ...table[name], dark };
}

/**
 * Text straight on the sky is dark ink in light moods and white in dark ones
 * (`--px-ink` and friends), at least 4.5:1 on every mood. Inherited by
 * everything on the sky.
 */
export function applyPaletteVars(el: HTMLElement, p: Palette) {
  const st = el.style;
  const set = p.night ? "dark" : "light";
  st.setProperty("--px-ink", `var(--sky-on-${set}-ink)`);
  st.setProperty("--px-ink-2", `var(--sky-on-${set}-ink-2)`);
  st.setProperty("--px-ink-3", `var(--sky-on-${set}-ink-3)`);
  st.setProperty("--px-halo", `var(--sky-on-${set}-halo)`);
  st.setProperty("--px-shadow", `var(--sky-on-${set}-shadow)`);
  st.setProperty("--px-line", `var(--sky-on-${set}-line)`);
  st.setProperty("--px-ground", cssRgb(p.mid));
  st.setProperty("--px-tint", cssRgb(lerp3(p.top, p.mid, 0.55)));
  st.setProperty("--px-hue", cssRgb(p.mid));
  el.setAttribute("data-px-night", p.night ? "1" : "0");
  el.setAttribute("data-px-mood", p.name);
}
