/**
 * The document style model (prototype doc-style.jsx 87–185, docs-kit.jsx
 * dcSetStyle). A document is a page card floating on a full-bleed backdrop;
 * its style is one object on `Page.style`:
 *   { backdrop, page, text, separator, font, wide }
 * The cover is the page's own `coverUrl`, read into the resolved style so the
 * drawing code reads one object, and written back to `coverUrl` on save.
 *
 * Colours are never literals here: every value is a themes.css token, read
 * through `TokenReader` (the `.needt-v3` element's computed style on the
 * client, a map in tests).
 */

export type TokenReader = (name: string) => string;

export interface DocStyle {
  backdrop: string;
  page: string;
  text: string;
  cover: string | null;
  separator: "line" | "dots" | "wave";
  font: string;
  wide: boolean;
  /** Phone look over a backdrop (style.bdLook / bdBlur), kept as written. */
  bdLook?: "faded" | "immersive";
  bdBlur?: boolean;
}

export const DOC_DEFAULT: DocStyle = {
  backdrop: "none",
  page: "white",
  text: "auto",
  cover: null,
  separator: "line",
  font: "sans",
  wide: false,
};

export interface DocPage {
  id: string;
  name: string;
  /** Token names for the Light and Dark reading. */
  l: string;
  d: string;
  /** The app ground's tint when there is no backdrop. */
  amb?: [string, string];
}

const page = (id: string, name: string, amb = true): DocPage => ({
  id,
  name,
  l: `--doc-page-${id}-l`,
  d: `--doc-page-${id}-d`,
  amb: amb ? [`--doc-page-${id}-amb-l`, `--doc-page-${id}-amb-d`] : undefined,
});

export const DOC_PAGES: DocPage[] = [
  page("white", "White", false),
  page("paper", "Paper"),
  page("rose", "Rose"),
  page("lilac", "Lilac"),
  page("sage", "Sage"),
  page("sky", "Sky"),
  page("sand", "Sand"),
  page("graphite", "Graphite", false),
  page("black", "Black", false),
];

export interface DocText {
  id: string;
  name: string;
  /** Deep and pale readings of a hue (token names). */
  dk?: string;
  lt?: string;
}

const hue = (id: string, name: string): DocText => ({
  id,
  name,
  dk: `--doc-text-${id}-dk`,
  lt: `--doc-text-${id}-lt`,
});

export const DOC_TEXTS: DocText[] = [
  { id: "auto", name: "Auto" },
  { id: "dark", name: "Dark" },
  { id: "light", name: "Light" },
  hue("umber", "Umber"),
  hue("wine", "Wine"),
  hue("plum", "Plum"),
  hue("navy", "Navy"),
  hue("forest", "Forest"),
];

export const DOC_BACKDROPS = [
  { id: "none", name: "None" },
  { id: "sparkle", name: "Sparkle" },
  { id: "dunes", name: "Dunes" },
  { id: "mist", name: "Mist" },
  { id: "grid", name: "Dotted" },
  { id: "ink", name: "Marble" },
  { id: "sage", name: "Meadow" },
  { id: "ocean", name: "Ocean" },
] as const;

export const DOC_FONTS = [
  { id: "sans", glyph: "Aa", name: "Default", css: "var(--font-sans)" },
  {
    id: "serif",
    glyph: "Ss",
    name: "Serif",
    css: "var(--font-v3-serif), 'Iowan Old Style', Georgia, serif",
  },
  { id: "mono", glyph: "00", name: "Mono", css: "var(--font-mono)" },
  {
    id: "rounded",
    glyph: "Rr",
    name: "Rounded",
    css: "var(--font-v3-rounded), ui-rounded, 'SF Pro Rounded', system-ui, -apple-system, 'Segoe UI', sans-serif",
  },
] as const;

export const DOC_SEPARATORS = [
  ["line", "Line"],
  ["dots", "Dots"],
  ["wave", "Hand-drawn"],
] as const;

type PresetStyle = Pick<DocStyle, "backdrop" | "page" | "text" | "font">;

/** "All Styles": every entry is a complete style. Old theme ids map 1:1. */
export const DOC_PRESETS: { id: string; name: string; style: PresetStyle }[] = [
  {
    id: "default",
    name: "Default",
    style: { backdrop: "none", page: "white", text: "auto", font: "sans" },
  },
  {
    id: "paper",
    name: "Paper",
    style: { backdrop: "grid", page: "paper", text: "umber", font: "serif" },
  },
  {
    id: "ink",
    name: "Ink",
    style: { backdrop: "ink", page: "white", text: "auto", font: "sans" },
  },
  {
    id: "rose",
    name: "Rose",
    style: { backdrop: "dunes", page: "rose", text: "wine", font: "serif" },
  },
  {
    id: "sage",
    name: "Sage",
    style: { backdrop: "sage", page: "sage", text: "forest", font: "sans" },
  },
  {
    id: "ocean",
    name: "Ocean",
    style: { backdrop: "ocean", page: "sky", text: "navy", font: "sans" },
  },
  {
    id: "sand",
    name: "Sand",
    style: { backdrop: "dunes", page: "sand", text: "umber", font: "serif" },
  },
  {
    id: "night",
    name: "Night",
    style: { backdrop: "ink", page: "black", text: "auto", font: "sans" },
  },
  {
    id: "sparkles",
    name: "Sparkles",
    style: {
      backdrop: "sparkle",
      page: "white",
      text: "plum",
      font: "rounded",
    },
  },
  {
    id: "mist",
    name: "Mist",
    style: { backdrop: "mist", page: "lilac", text: "plum", font: "rounded" },
  },
];

const GROUND_MAP: Record<string, string> = {
  mist: "mist",
  sand: "dunes",
  sage: "sage",
  stone: "grid",
};

export interface StyledDoc {
  coverUrl: string | null;
  style: Record<string, unknown> | null;
}

const styleField = (doc: StyledDoc | null | undefined) =>
  doc?.style && typeof doc.style === "object" ? doc.style : {};

/**
 * The resolved style a page draws with. A doc that has a real style object
 * reads it; an older doc reads its theme preset or ground until the first
 * change writes a real style.
 */
export function styleOf(doc: StyledDoc | null | undefined): DocStyle {
  if (!doc) return DOC_DEFAULT;
  const st = styleField(doc);
  const cover = { cover: doc.coverUrl || null };
  if ("backdrop" in st) return { ...DOC_DEFAULT, ...st, ...cover } as DocStyle;
  const preset =
    typeof st.theme === "string"
      ? DOC_PRESETS.find((p) => p.id === st.theme)
      : null;
  if (preset) return { ...DOC_DEFAULT, ...preset.style, ...cover };
  const ground = typeof st.ground === "string" ? GROUND_MAP[st.ground] : null;
  if (ground) return { ...DOC_DEFAULT, backdrop: ground, ...cover };
  return { ...DOC_DEFAULT, ...cover };
}

/**
 * The write for a style change: the whole style object (cover moved out to
 * `coverUrl`), keeping a legacy `theme` / `ground` the doc already carries.
 */
export function stylePatch(doc: StyledDoc, patch: Partial<DocStyle>) {
  const next: Record<string, unknown> = { ...styleOf(doc), ...patch };
  const coverUrl = (next.cover as string | null) || null;
  delete next.cover;
  const st = styleField(doc);
  if (st.theme) next.theme = st.theme;
  if (st.ground) next.ground = st.ground;
  return { style: next, coverUrl };
}

/** The write for "All Styles": the preset's four keys over the current style. */
export function presetPatch(doc: StyledDoc, presetId: string) {
  const preset = DOC_PRESETS.find((p) => p.id === presetId);
  if (!preset) return null;
  const st = styleField(doc);
  const next: Record<string, unknown> = { ...styleOf(doc), ...preset.style };
  delete next.cover;
  // Sparkles and Mist have no legacy theme id; they keep the one there was.
  const theme =
    preset.id === "sparkles" || preset.id === "mist" ? st.theme : preset.id;
  if (theme) next.theme = theme;
  if (st.ground) next.ground = st.ground;
  return { style: next };
}

export const presetOf = (s: DocStyle) =>
  DOC_PRESETS.find((p) =>
    (["backdrop", "page", "text", "font"] as const).every(
      (k) => p.style[k] === s[k]
    )
  ) ?? null;

export const pageOf = (id: string) =>
  DOC_PAGES.find((p) => p.id === id) ?? DOC_PAGES[0];

export const fontOf = (id: string) =>
  DOC_FONTS.find((f) => f.id === id) ?? DOC_FONTS[0];

export const textOf = (id: string) =>
  DOC_TEXTS.find((t) => t.id === id) ?? DOC_TEXTS[0];

export const backdropName = (id: string) =>
  (DOC_BACKDROPS.find((b) => b.id === id) ?? DOC_BACKDROPS[0]).name;

function hexRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** "r, g, b" for an rgba() built from a hex token; "" when unreadable. */
export const rgbOf = (hex: string) => hexRgb(hex)?.join(", ") ?? "";

/** WCAG relative luminance of a hex colour. */
export function luminance(hex: string) {
  const rgb = hexRgb(hex);
  if (!rgb) return 1;
  const c = rgb.map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export function contrast(a: string, b: string) {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * The ink for a page colour: Dark / Light as asked; Auto, or a hue, takes
 * whichever reading reads on the page, so text stays at or above 4.5:1.
 */
export function inkFor(pageHex: string, text: string, read: TokenReader) {
  const dark = read("--doc-ink-dark");
  const light = read("--doc-ink-light");
  if (text === "dark") return dark;
  if (text === "light") return light;
  const darkPage = contrast(pageHex, light) > contrast(pageHex, dark);
  const t = DOC_TEXTS.find((x) => x.id === text);
  if (t?.dk && t.lt) return read(darkPage ? t.lt : t.dk);
  return darkPage ? light : dark;
}

/**
 * The inline half of a styled page; themes.css (`.dt-themed`) picks the
 * Light or Dark pair and rebuilds the grey ladder from the ink.
 */
export function pageVars(s: DocStyle, read: TokenReader) {
  const pg = pageOf(s.page);
  const pl = read(pg.l);
  const pd = read(pg.d);
  if (!pl || !pd) return {};
  const il = inkFor(pl, s.text, read);
  const id = inkFor(pd, s.text, read);
  return {
    "--dt-page-l": pl,
    "--dt-page-d": pd,
    "--dt-ink-l": rgbOf(il),
    "--dt-ink-d": rgbOf(id),
    "--dt-head-l": il,
    "--dt-head-d": id,
  } as Record<string, string>;
}

/** Covers the page can draw: an uploaded picture by URL. */
export const isPictureCover = (cover: string | null | undefined) =>
  !!cover && /^(data:|blob:|https?:|\/)/.test(cover);
