/**
 * Design v3 theme model: System / Light / Dark / Time, and the accents.
 *
 * Ported from the prototype's `settings-kit.jsx` (lists) and `Drift.jsx` (the
 * Time engine). Client-safe and pure: nothing here touches the DOM except
 * `readTimePalettes`, which takes the element to read from.
 *
 * How a choice reaches CSS: the `.needt-v3` scope element carries
 * `data-theme="light|dark"` (the side being worn), `data-drift="on"` while the
 * Time theme is chosen, and `data-accent`. Time additionally writes a few
 * inline custom properties (`vars`) between its keyframes. The vendored
 * stylesheets (`src/styles/v3/*.css`) key on exactly those attributes.
 */
import { newDate } from "@/lib/date-utils";

export type ThemeChoice = "system" | "light" | "dark" | "time";
export type ThemeSide = "light" | "dark";

export const THEMES: ReadonlyArray<readonly [ThemeChoice, string]> = [
  ["system", "System"],
  ["light", "Light"],
  ["dark", "Dark"],
  ["time", "Time"],
];

export type AccentId =
  | "blue"
  | "pink"
  | "mint"
  | "violet"
  | "amber"
  | "graphite"
  | "aurora"
  | "sunset"
  | "lagoon";

export interface Accent {
  id: AccentId;
  label: string;
  gradient: boolean;
}

/** Solid accents first, then the gradients. `id` is the `data-accent` value. */
export const ACCENTS: ReadonlyArray<Accent> = [
  { id: "blue", label: "Blue", gradient: false },
  { id: "pink", label: "Pink", gradient: false },
  { id: "mint", label: "Mint", gradient: false },
  { id: "violet", label: "Violet", gradient: false },
  { id: "amber", label: "Amber", gradient: false },
  { id: "graphite", label: "Graphite", gradient: false },
  { id: "aurora", label: "Aurora", gradient: true },
  { id: "sunset", label: "Sunset", gradient: true },
  { id: "lagoon", label: "Lagoon", gradient: true },
];

export const ACCENT_IDS: ReadonlyArray<AccentId> = ACCENTS.map((a) => a.id);
export const DEFAULT_THEME: ThemeChoice = "system";
export const DEFAULT_ACCENT: AccentId = "blue";

/**
 * Stored names from before the four themes: paper/warm were light, dim was
 * dark. Anything unknown falls back to the default rather than throwing.
 */
export function normalizeTheme(value: unknown): ThemeChoice {
  const map: Record<string, ThemeChoice> = {
    light: "light",
    paper: "light",
    warm: "light",
    dark: "dark",
    dim: "dark",
    gray: "dark",
    graphite: "dark",
    system: "system",
    time: "time",
  };
  return (typeof value === "string" && map[value]) || DEFAULT_THEME;
}

export function normalizeAccent(value: unknown): AccentId {
  return typeof value === "string" &&
    (ACCENT_IDS as ReadonlyArray<string>).includes(value)
    ? (value as AccentId)
    : DEFAULT_ACCENT;
}

/* ---- Time ---------------------------------------------------------------- */

/** Time zone → [city, lat, lon]. No network, no geolocation prompt. */
const TZ_PLACES: Record<string, readonly [string, number, number]> = {
  "Europe/Zurich": ["Zürich", 47.37, 8.54],
  "Europe/Berlin": ["Berlin", 52.52, 13.4],
  "Europe/London": ["London", 51.51, -0.13],
  "Europe/Paris": ["Paris", 48.86, 2.35],
  "Europe/Madrid": ["Madrid", 40.42, -3.7],
  "Europe/Rome": ["Rome", 41.9, 12.5],
  "Europe/Amsterdam": ["Amsterdam", 52.37, 4.9],
  "Europe/Brussels": ["Brussels", 50.85, 4.35],
  "Europe/Vienna": ["Vienna", 48.21, 16.37],
  "Europe/Prague": ["Prague", 50.08, 14.44],
  "Europe/Warsaw": ["Warsaw", 52.23, 21.01],
  "Europe/Stockholm": ["Stockholm", 59.33, 18.07],
  "Europe/Oslo": ["Oslo", 59.91, 10.75],
  "Europe/Copenhagen": ["Copenhagen", 55.68, 12.57],
  "Europe/Helsinki": ["Helsinki", 60.17, 24.94],
  "Europe/Kyiv": ["Kyiv", 50.45, 30.52],
  "Europe/Kiev": ["Kyiv", 50.45, 30.52],
  "Europe/Moscow": ["Moscow", 55.76, 37.62],
  "Europe/Istanbul": ["Istanbul", 41.01, 28.98],
  "Europe/Athens": ["Athens", 37.98, 23.73],
  "Europe/Lisbon": ["Lisbon", 38.72, -9.14],
  "Europe/Dublin": ["Dublin", 53.35, -6.26],
  "America/New_York": ["New York", 40.71, -74.01],
  "America/Chicago": ["Chicago", 41.88, -87.63],
  "America/Denver": ["Denver", 39.74, -104.99],
  "America/Los_Angeles": ["Los Angeles", 34.05, -118.24],
  "America/Toronto": ["Toronto", 43.65, -79.38],
  "America/Vancouver": ["Vancouver", 49.28, -123.12],
  "America/Mexico_City": ["Mexico City", 19.43, -99.13],
  "America/Sao_Paulo": ["São Paulo", -23.55, -46.63],
  "America/Argentina/Buenos_Aires": ["Buenos Aires", -34.6, -58.38],
  "America/Buenos_Aires": ["Buenos Aires", -34.6, -58.38],
  "Asia/Tokyo": ["Tokyo", 35.68, 139.69],
  "Asia/Seoul": ["Seoul", 37.57, 126.98],
  "Asia/Shanghai": ["Shanghai", 31.23, 121.47],
  "Asia/Hong_Kong": ["Hong Kong", 22.32, 114.17],
  "Asia/Singapore": ["Singapore", 1.35, 103.82],
  "Asia/Kolkata": ["Kolkata", 22.57, 88.36],
  "Asia/Dubai": ["Dubai", 25.2, 55.27],
  "Asia/Bangkok": ["Bangkok", 13.76, 100.5],
  "Asia/Jakarta": ["Jakarta", -6.21, 106.85],
  "Asia/Jerusalem": ["Jerusalem", 31.77, 35.21],
  "Australia/Sydney": ["Sydney", -33.87, 151.21],
  "Australia/Melbourne": ["Melbourne", -37.81, 144.96],
  "Pacific/Auckland": ["Auckland", -36.85, 174.76],
  "Africa/Cairo": ["Cairo", 30.04, 31.24],
  "Africa/Johannesburg": ["Johannesburg", -26.2, 28.05],
  "Africa/Lagos": ["Lagos", 6.52, 3.38],
};

export interface Place {
  tz: string;
  name: string;
  lat: number;
  lon: number;
  exact: boolean;
}

export function placeFromTz(tzOverride?: string, at: Date = newDate()): Place {
  let tz = tzOverride;
  try {
    if (!tz) tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    tz = undefined;
  }
  const hit = tz ? TZ_PLACES[tz] : undefined;
  if (tz && hit) {
    return { tz, name: hit[0], lat: hit[1], lon: hit[2], exact: true };
  }
  const off = -at.getTimezoneOffset() / 60;
  const name = tz
    ? tz.split("/").pop()!.replace(/_/g, " ")
    : `UTC${off >= 0 ? "+" : ""}${off}`;
  return { tz: tz || "", name, lat: 45, lon: off * 15, exact: false };
}

export interface SunTimes {
  noon: number;
  sunrise: number | null;
  sunset: number | null;
  dawn: number | null;
  dusk: number | null;
  polar: "rise" | "set" | null;
}

/**
 * NOAA general solar position. Local clock hours (the date's own UTC offset)
 * for solar noon, sunrise/sunset (zenith 90.833°) and civil dawn/dusk (96°).
 */
export function sunTimes(date: Date, lat: number, lon: number): SunTimes {
  const rad = Math.PI / 180;
  const y = date.getFullYear();
  const doy =
    Math.round(
      (Date.UTC(y, date.getMonth(), date.getDate()) - Date.UTC(y, 0, 1)) /
        86400000
    ) + 1;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const g = ((2 * Math.PI) / (leap ? 366 : 365)) * (doy - 1);
  const eqt =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(g) -
      0.032077 * Math.sin(g) -
      0.014615 * Math.cos(2 * g) -
      0.040849 * Math.sin(2 * g));
  const decl =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);
  const off = -date.getTimezoneOffset() / 60;
  const norm = (h: number) => ((h % 24) + 24) % 24;
  const noonUtcMin = 720 - 4 * lon - eqt;
  const ha = (zenith: number): { deg?: number; never?: "rise" | "set" } => {
    const c =
      Math.cos(zenith * rad) / (Math.cos(lat * rad) * Math.cos(decl)) -
      Math.tan(lat * rad) * Math.tan(decl);
    if (c > 1) return { never: "rise" };
    if (c < -1) return { never: "set" };
    return { deg: Math.acos(c) / rad };
  };
  const at = (min: number) => norm(min / 60 + off);
  const h0 = ha(90.833);
  const h6 = ha(96);
  return {
    noon: at(noonUtcMin),
    sunrise: h0.deg == null ? null : at(noonUtcMin - 4 * h0.deg),
    sunset: h0.deg == null ? null : at(noonUtcMin + 4 * h0.deg),
    dawn: h6.deg == null ? null : at(noonUtcMin - 4 * h6.deg),
    dusk: h6.deg == null ? null : at(noonUtcMin + 4 * h6.deg),
    polar: h0.never ?? null,
  };
}

export type TimeReadingName =
  | "day"
  | "dawn"
  | "golden"
  | "dusk"
  | "duskDark"
  | "dawnDark"
  | "night";

export interface TimePalette {
  side: ThemeSide;
  bg: string;
  raised: string;
  ink: string;
}

export type TimePalettes = Record<TimeReadingName, TimePalette>;

/** The `--drift-*` token stem for each reading, declared in themes.css. */
const DRIFT_STEMS: Record<TimeReadingName, [ThemeSide, string]> = {
  day: ["light", "day"],
  dawn: ["light", "dawn"],
  golden: ["light", "golden"],
  dusk: ["light", "dusk"],
  duskDark: ["dark", "dusk-dark"],
  dawnDark: ["dark", "dawn-dark"],
  night: ["dark", "night"],
};

/**
 * Read the seven Time palettes from the `--drift-*` tokens on a `.needt-v3`
 * element, so the colours have one home (themes.css), not two.
 */
export function readTimePalettes(el: Element): TimePalettes {
  const css = getComputedStyle(el);
  const read = (name: string) => css.getPropertyValue(name).trim();
  const out = {} as TimePalettes;
  for (const [key, [side, stem]] of Object.entries(DRIFT_STEMS) as Array<
    [TimeReadingName, [ThemeSide, string]]
  >) {
    out[key] = {
      side,
      bg: read(`--drift-${stem}-bg`),
      raised: read(`--drift-${stem}-raised`),
      ink: read(`--drift-${stem}-ink`),
    };
  }
  return out;
}

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mixHex(a: string, b: string, t: number): string {
  const A = hexRgb(a);
  const B = hexRgb(b);
  return (
    "#" +
    A.map((x, i) =>
      Math.round(x + (B[i] - x) * t)
        .toString(16)
        .padStart(2, "0")
    ).join("")
  );
}

function smooth(t: number) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

/** Inline overrides for one reading. The two pure readings write nothing. */
function paletteVars(p: TimePalette, pure: boolean): Record<string, string> {
  if (pure) return {};
  const r = hexRgb(p.raised);
  const dark = p.side === "dark";
  return {
    "--background": p.bg,
    "--surface-raised": p.raised,
    "--foreground": p.ink,
    "--foreground-rgb": hexRgb(p.ink).join(", "),
    "--toolbar-fill": `rgba(${r.join(", ")}, ${dark ? 0.88 : 0.85})`,
    "--floating-fill": `rgba(${r.join(", ")}, ${dark ? 0.78 : 0.72})`,
  };
}

export type TimePhase = "Dawn" | "Day" | "Golden hour" | "Dusk" | "Night";

export interface TimeReading {
  side: ThemeSide;
  palette: TimePalette;
  pure: boolean;
  phase: TimePhase;
  times: SunTimes;
  place: Place;
  vars: Record<string, string>;
}

/** The whole Time theme for one moment. Pure: any date, any place. */
export function timeThemeAt(
  date: Date,
  place: Place,
  palettes: TimePalettes
): TimeReading {
  const t = sunTimes(date, place.lat, place.lon);
  const hour =
    date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  let r = t.sunrise ?? 6;
  let s = t.sunset ?? 18;
  if (t.polar === "set") {
    r = -10;
    s = 34; // midnight sun: day all day
  } else if (t.polar === "rise") {
    r = 30;
    s = 30; // polar night: night all day
  }
  const K: Array<[number, TimeReadingName]> = [
    [r - 0.9, "night"],
    [r - 0.45, "dawnDark"],
    [r - 0.35, "dawn"],
    [r + 0.6, "day"],
    [s - 1.4, "day"],
    [s - 0.9, "golden"],
    [s - 0.15, "golden"],
    [s + 0.25, "dusk"],
    [s + 0.35, "duskDark"],
    [s + 1.0, "night"],
  ];
  let name: TimeReadingName = "night";
  let next: TimeReadingName | null = null;
  let k = 0;
  if (hour >= K[0][0] && hour < K[K.length - 1][0]) {
    for (let i = 0; i < K.length - 1; i += 1) {
      if (hour >= K[i][0] && hour < K[i + 1][0]) {
        name = K[i][1];
        next = K[i + 1][1];
        k = (hour - K[i][0]) / (K[i + 1][0] - K[i][0]);
        break;
      }
    }
  }
  let p = palettes[name];
  if (next && next !== name) {
    const a = palettes[name];
    const b = palettes[next];
    if (a.side !== b.side) p = k < 0.5 ? a : b;
    else {
      const e = smooth(k);
      p = {
        side: a.side,
        bg: mixHex(a.bg, b.bg, e),
        raised: mixHex(a.raised, b.raised, e),
        ink: mixHex(a.ink, b.ink, e),
      };
    }
  }
  const same = (x: TimePalette, y: TimePalette) =>
    x.bg === y.bg && x.raised === y.raised && x.ink === y.ink;
  const pure = same(p, palettes.day) || same(p, palettes.night);
  const phase: TimePhase =
    hour >= r - 0.9 && hour < r + 0.6
      ? "Dawn"
      : hour >= r + 0.6 && hour < s - 1.4
        ? "Day"
        : hour >= s - 1.4 && hour < s
          ? "Golden hour"
          : hour >= s && hour < s + 1.0
            ? "Dusk"
            : "Night";
  return {
    side: p.side,
    palette: p,
    pure,
    phase,
    times: t,
    place,
    vars: paletteVars(p, pure),
  };
}

/** What the scope element wears for a choice. */
export interface ResolvedTheme {
  side: ThemeSide;
  drift: boolean;
  vars: Record<string, string>;
}

export function resolveTheme(
  choice: ThemeChoice,
  osDark: boolean,
  time?: TimeReading | null
): ResolvedTheme {
  if (choice === "time" && time) {
    return { side: time.side, drift: true, vars: time.vars };
  }
  const dark = choice === "dark" || (choice === "system" && osDark);
  return { side: dark ? "dark" : "light", drift: choice === "time", vars: {} };
}
