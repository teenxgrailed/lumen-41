/* THE THEME ENGINE — Light, Dark, System, and Time.
 *
 * Light and Dark are fixed. System reads the OS. TIME follows the sun at the
 * person's own city: dawn (cool, pale) → day (Light, exactly) → golden hour
 * (warm paper) → dusk (muted rose) → night (Dark, exactly).
 *
 * The city comes from the browser's time zone through a small built-in table —
 * no network, no geolocation prompt. A zone not in the table falls back to a
 * longitude from its UTC offset (× 15) at latitude 45.
 *
 * Sunrise and sunset come from NOAA's general solar-position equations. The
 * colour is recomputed once a minute and interpolated between keyframes, so
 * each step is invisible under a 1.5s transition. Time wears .paper on the
 * light side and .dark on the dark side; the one flip between them happens in
 * the dark of dusk (and the pale of dawn) and is a view-transition crossfade. */

/* Time zone → [city, lat, lon]. */
const TZ_PLACES = {
  "Europe/Zurich": ["Zürich", 47.37, 8.54],
  "Europe/Berlin": ["Berlin", 52.52, 13.40],
  "Europe/London": ["London", 51.51, -0.13],
  "Europe/Paris": ["Paris", 48.86, 2.35],
  "Europe/Madrid": ["Madrid", 40.42, -3.70],
  "Europe/Rome": ["Rome", 41.90, 12.50],
  "Europe/Amsterdam": ["Amsterdam", 52.37, 4.90],
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
  "America/Argentina/Buenos_Aires": ["Buenos Aires", -34.60, -58.38],
  "America/Buenos_Aires": ["Buenos Aires", -34.60, -58.38],
  "Asia/Tokyo": ["Tokyo", 35.68, 139.69],
  "Asia/Seoul": ["Seoul", 37.57, 126.98],
  "Asia/Shanghai": ["Shanghai", 31.23, 121.47],
  "Asia/Hong_Kong": ["Hong Kong", 22.32, 114.17],
  "Asia/Singapore": ["Singapore", 1.35, 103.82],
  "Asia/Kolkata": ["Kolkata", 22.57, 88.36],
  "Asia/Dubai": ["Dubai", 25.20, 55.27],
  "Asia/Bangkok": ["Bangkok", 13.76, 100.50],
  "Asia/Jakarta": ["Jakarta", -6.21, 106.85],
  "Asia/Jerusalem": ["Jerusalem", 31.77, 35.21],
  "Australia/Sydney": ["Sydney", -33.87, 151.21],
  "Australia/Melbourne": ["Melbourne", -37.81, 144.96],
  "Pacific/Auckland": ["Auckland", -36.85, 174.76],
  "Africa/Cairo": ["Cairo", 30.04, 31.24],
  "Africa/Johannesburg": ["Johannesburg", -26.20, 28.05],
  "Africa/Lagos": ["Lagos", 6.52, 3.38]
};

function placeFromTz(tzOverride) {
  let tz = tzOverride;
  try { if (!tz) tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) {}
  const hit = tz && TZ_PLACES[tz];
  if (hit) return { tz: tz, name: hit[0], lat: hit[1], lon: hit[2], exact: true };
  const off = -new Date().getTimezoneOffset() / 60;
  const name = tz ? tz.split("/").pop().replace(/_/g, " ") : "UTC" + (off >= 0 ? "+" : "") + off;
  return { tz: tz || "", name: name, lat: 45, lon: off * 15, exact: false };
}

/* NOAA general solar position. Returns LOCAL clock hours (the date's own UTC
   offset) for solar noon, sunrise/sunset (zenith 90.833°) and civil
   dawn/dusk (96°). null where the sun never reaches that altitude. */
function sunTimes(date, lat, lon) {
  const rad = Math.PI / 180;
  const y = date.getFullYear();
  const doy = Math.round((Date.UTC(y, date.getMonth(), date.getDate()) - Date.UTC(y, 0, 1)) / 86400000) + 1;
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const g = (2 * Math.PI / (leap ? 366 : 365)) * (doy - 1);
  const eqt = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const off = -date.getTimezoneOffset() / 60;
  const norm = (h) => ((h % 24) + 24) % 24;
  const noonUtcMin = 720 - 4 * lon - eqt;
  function ha(zenith) {
    const c = Math.cos(zenith * rad) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl);
    if (c > 1) return { never: "rise" };
    if (c < -1) return { never: "set" };
    return { deg: Math.acos(c) / rad };
  }
  const at = (min) => norm(min / 60 + off);
  const h0 = ha(90.833), h6 = ha(96);
  return {
    noon: at(noonUtcMin),
    sunrise: h0.deg == null ? null : at(noonUtcMin - 4 * h0.deg),
    sunset: h0.deg == null ? null : at(noonUtcMin + 4 * h0.deg),
    dawn: h6.deg == null ? null : at(noonUtcMin - 4 * h6.deg),
    dusk: h6.deg == null ? null : at(noonUtcMin + 4 * h6.deg),
    polar: h0.never || null
  };
}

/* The five readings of the day. `side` is which theme class is worn. DAY and
   NIGHT are the Light and Dark tokens verbatim. */
const TIME_PALETTES = {
  day:      { side: "paper", bg: cssVar("--drift-day-bg"), raised: cssVar("--drift-day-raised"), ink: cssVar("--drift-day-ink") },
  dawn:     { side: "paper", bg: cssVar("--drift-dawn-bg"), raised: cssVar("--drift-dawn-raised"), ink: cssVar("--drift-dawn-ink") },
  golden:   { side: "paper", bg: cssVar("--drift-golden-bg"), raised: cssVar("--drift-golden-raised"), ink: cssVar("--drift-golden-ink") },
  dusk:     { side: "paper", bg: cssVar("--drift-dusk-bg"), raised: cssVar("--drift-dusk-raised"), ink: cssVar("--drift-dusk-ink") },
  duskDark: { side: "dark",  bg: cssVar("--drift-dusk-dark-bg"), raised: cssVar("--drift-dusk-dark-raised"), ink: cssVar("--drift-dusk-dark-ink") },
  dawnDark: { side: "dark",  bg: cssVar("--drift-dawn-dark-bg"), raised: cssVar("--drift-dawn-dark-raised"), ink: cssVar("--drift-dawn-dark-ink") },
  night:    { side: "dark",  bg: cssVar("--drift-night-bg"), raised: cssVar("--drift-night-raised"), ink: cssVar("--drift-night-ink") }
};

function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mixHex(a, b, t) {
  const A = hexRgb(a), B = hexRgb(b);
  return "#" + A.map((x, i) => Math.round(x + (B[i] - x) * t).toString(16).padStart(2, "0")).join("");
}
function smooth(t) { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); }

/* The inline overrides for one reading. The two pure readings write nothing,
   so day IS Light and night IS Dark. */
function paletteVars(p, pure) {
  if (pure) return { background: "var(--background)" };
  const r = hexRgb(p.raised);
  const dark = p.side === "dark";
  return {
    background: "var(--background)",
    "--background": p.bg,
    "--surface-raised": p.raised,
    "--foreground": p.ink,
    "--foreground-rgb": hexRgb(p.ink).join(", "),
    "--toolbar-fill": "rgba(" + r.join(", ") + ", " + (dark ? 0.88 : 0.85) + ")",
    "--floating-fill": "rgba(" + r.join(", ") + ", " + (dark ? 0.78 : 0.72) + ")"
  };
}

function fmtHour(h) {
  if (h == null) return "—";
  const m = Math.round(h * 60) % 1440;
  return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
}

/* The whole Time theme for one moment. Pure — the settings preview and the
   debug hook call it with any date. */
function timeThemeAt(date, place) {
  const pl = place || placeFromTz();
  const t = sunTimes(date, pl.lat, pl.lon);
  const hour = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  let r = t.sunrise, s = t.sunset;
  if (t.polar === "set") { r = -10; s = 34; }      /* midnight sun: day all day */
  else if (t.polar === "rise") { r = 30; s = 30; } /* polar night: night all day */
  /* Keyframes in local hours. Same-side neighbours interpolate; across the
     side change the step falls at the midpoint (the crossfade covers it). */
  const K = [
    [r - 0.9, "night"], [r - 0.45, "dawnDark"], [r - 0.35, "dawn"], [r + 0.6, "day"],
    [s - 1.4, "day"], [s - 0.9, "golden"], [s - 0.15, "golden"], [s + 0.25, "dusk"],
    [s + 0.35, "duskDark"], [s + 1.0, "night"]
  ];
  let name = "night", next = null, k = 0;
  if (hour >= K[0][0] && hour < K[K.length - 1][0]) {
    for (let i = 0; i < K.length - 1; i++) {
      if (hour >= K[i][0] && hour < K[i + 1][0]) {
        name = K[i][1]; next = K[i + 1][1];
        k = (hour - K[i][0]) / (K[i + 1][0] - K[i][0]);
        break;
      }
    }
  }
  let p = TIME_PALETTES[name], pure = false;
  if (next && next !== name) {
    const a = TIME_PALETTES[name], b = TIME_PALETTES[next];
    if (a.side !== b.side) p = k < 0.5 ? a : b;
    else {
      const e = smooth(k);
      p = { side: a.side, bg: mixHex(a.bg, b.bg, e), raised: mixHex(a.raised, b.raised, e), ink: mixHex(a.ink, b.ink, e) };
    }
  }
  const P = TIME_PALETTES;
  pure = (p.bg === P.day.bg && p.raised === P.day.raised && p.ink === P.day.ink) ||
    (p.bg === P.night.bg && p.raised === P.night.raised && p.ink === P.night.ink);
  const phase = hour >= r - 0.9 && hour < r + 0.6 ? "Dawn"
    : hour >= r + 0.6 && hour < s - 1.4 ? "Day"
    : hour >= s - 1.4 && hour < s ? "Golden hour"
    : hour >= s && hour < s + 1.0 ? "Dusk" : "Night";
  const upcoming = phase === "Night" || phase === "Dawn"
    ? (t.sunrise != null ? "sunrise " + fmtHour(t.sunrise) : "no sunrise today")
    : (t.sunset != null ? "sunset " + fmtHour(t.sunset) : "no sunset today");
  return {
    side: p.side, palette: p, pure: pure, phase: phase, times: t, place: pl,
    vars: paletteVars(p, pure),
    line: "Now: " + phase + " · " + upcoming + " · " + pl.name
  };
}

/* THE HOOK — what the shell wears: the theme class and the inline overrides.
   `theme` is one of light | dark | system | time. */
function useDrift(theme) {
  const [now, setNow] = React.useState(() => new Date());
  const [at, setAt] = React.useState(null);
  const [os, setOs] = React.useState(() =>
    typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const place = React.useMemo(() => placeFromTz(), []);

  React.useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(id);
  }, []);
  React.useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const read = (e) => setOs(e.matches);
    mq.addEventListener("change", read);
    return () => mq.removeEventListener("change", read);
  }, []);
  /* Debug: pin the Time theme to any moment (null to release). Returns the
     reading for that moment. */
  React.useEffect(() => {
    window.__timeThemeAt = (d) => {
      const date = d == null ? null : new Date(d);
      setAt(date);
      /* The pixel sky (scenes.jsx) follows the same pinned moment. */
      window.__pxTimeAt = date;
      try { window.dispatchEvent(new Event("px-time")); } catch (e) {}
      return timeThemeAt(date || new Date(), place);
    };
  }, [place]);

  const tt = timeThemeAt(at || now, place);
  let computed;
  if (theme === "time") {
    computed = { themeClass: tt.side, vars: tt.vars, time: tt };
  } else {
    const dark = theme === "dark" || (theme === "system" && os);
    computed = { themeClass: dark ? "dark" : "paper", vars: { background: "var(--background)" }, time: tt };
  }

  /* The light↔dark flip of Time is crossfaded: hold the old reading until the
     view transition has its snapshot, then commit the new one inside it. */
  const [shownClass, setShownClass] = React.useState(computed.themeClass);
  const lastShown = React.useRef(computed);
  if (computed.themeClass === shownClass) lastShown.current = computed;
  const latest = React.useRef(computed);
  latest.current = computed;
  React.useEffect(() => {
    if (shownClass === computed.themeClass) return;
    const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const commit = () => setShownClass(latest.current.themeClass);
    if (theme === "time" && document.startViewTransition && !reduced) {
      document.startViewTransition(() => ReactDOM.flushSync(commit));
    } else commit();
  }, [computed.themeClass, shownClass, theme]);
  const out = lastShown.current;

  return {
    themeClass: out.themeClass,
    resolved: out.themeClass,
    vars: out.vars,
    quiet: "0",
    time: tt,
    times: tt.times,
    place: place
  };
}

/* Stored and URL theme names from before the four: paper/warm were light,
   dim was dark. */
function normalizeTheme(v) {
  const map = { light: "light", paper: "light", warm: "light", dark: "dark", dim: "dark", system: "system", time: "time" };
  return map[v] || "light";
}

Object.assign(window, { normalizeTheme, useDrift, sunTimes, timeThemeAt, placeFromTz, TIME_PALETTES, TZ_PLACES, mixHex });
