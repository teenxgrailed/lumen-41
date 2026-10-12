/* DOC STYLE — one document style model for the desktop and the phone
   (08.10.26, moved out of docs-kit.jsx so mobile-dev.html can load it).
   Pure data and drawing only: the style tables, dcStyleOf (old preset /
   ground ids read as their full style), page and ink vars, backdrops,
   fonts and covers. Writing a style (dcSetStyle) and the desktop-only
   theme helpers stay in docs-kit.jsx. Loaded by index-dev.html before
   docs-kit.jsx and by mobile-dev.html before Mobile.jsx. */

/* ---------- document themes (07.10.26) ----------
   Craft's document styles: a theme is a cover, a page colour, an ink, a
   heading colour and an ambient tint the app's ground takes on while the page
   is open. Every pair is given for both sides of the app (L on Light, D on
   Dark) and checked: ink on page >= 12:1, headings >= 5.8:1, tertiary meta
   >= 5.8:1. Covers are drawn here, from shapes — no images. */
const DT_THEMES = [
  { id: "default", name: "Default", motif: "grid", cv: [cssVar("--doc-theme-default-cv1"), cssVar("--doc-theme-default-cv2"), cssVar("--doc-theme-default-cv3"), cssVar("--doc-theme-default-cv4"), cssVar("--doc-theme-default-cv5")], amb: null },
  { id: "paper", name: "Paper", motif: "arches", cv: [cssVar("--doc-theme-paper-cv1"), cssVar("--doc-theme-paper-cv2"), cssVar("--doc-theme-paper-cv3"), cssVar("--doc-theme-paper-cv4"), cssVar("--doc-theme-paper-cv5")], amb: [cssVar("--doc-theme-paper-amb-l"), cssVar("--doc-theme-paper-amb-d")],
    L: { page: cssVar("--doc-theme-paper-page-l"), ink: cssVar("--doc-theme-paper-ink-l"), head: cssVar("--doc-theme-paper-head-l") }, D: { page: cssVar("--doc-theme-paper-page-d"), ink: cssVar("--doc-theme-paper-ink-d"), head: cssVar("--doc-theme-paper-head-d") } },
  { id: "ink", name: "Ink", motif: "lines", cv: [cssVar("--doc-theme-ink-cv1"), cssVar("--doc-theme-ink-cv2"), cssVar("--doc-theme-ink-cv3"), cssVar("--doc-theme-ink-cv4"), cssVar("--doc-theme-ink-cv5")], amb: [cssVar("--doc-theme-ink-amb-l"), cssVar("--doc-theme-ink-amb-d")],
    L: { page: cssVar("--doc-theme-ink-page-l"), ink: cssVar("--doc-theme-ink-ink-l"), head: cssVar("--doc-theme-ink-head-l") }, D: { page: cssVar("--doc-theme-ink-page-d"), ink: cssVar("--doc-theme-ink-ink-d"), head: cssVar("--doc-theme-ink-head-d") } },
  { id: "rose", name: "Rose", motif: "sun", cv: [cssVar("--doc-theme-rose-cv1"), cssVar("--doc-theme-rose-cv2"), cssVar("--doc-theme-rose-cv3"), cssVar("--doc-theme-rose-cv4"), cssVar("--doc-theme-rose-cv5")], amb: [cssVar("--doc-theme-rose-amb-l"), cssVar("--doc-theme-rose-amb-d")],
    L: { page: cssVar("--doc-theme-rose-page-l"), ink: cssVar("--doc-theme-rose-ink-l"), head: cssVar("--doc-theme-rose-head-l") }, D: { page: cssVar("--doc-theme-rose-page-d"), ink: cssVar("--doc-theme-rose-ink-d"), head: cssVar("--doc-theme-rose-head-d") } },
  { id: "sage", name: "Sage", motif: "hills", cv: [cssVar("--doc-theme-sage-cv1"), cssVar("--doc-theme-sage-cv2"), cssVar("--doc-theme-sage-cv3"), cssVar("--doc-theme-sage-cv4"), cssVar("--doc-theme-sage-cv5")], amb: [cssVar("--doc-theme-sage-amb-l"), cssVar("--doc-theme-sage-amb-d")],
    L: { page: cssVar("--doc-theme-sage-page-l"), ink: cssVar("--doc-theme-sage-ink-l"), head: cssVar("--doc-theme-sage-head-l") }, D: { page: cssVar("--doc-theme-sage-page-d"), ink: cssVar("--doc-theme-sage-ink-d"), head: cssVar("--doc-theme-sage-head-d") } },
  { id: "ocean", name: "Ocean", motif: "waves", cv: [cssVar("--doc-theme-ocean-cv1"), cssVar("--doc-theme-ocean-cv2"), cssVar("--doc-theme-ocean-cv3"), cssVar("--doc-theme-ocean-cv4"), cssVar("--doc-theme-ocean-cv5")], amb: [cssVar("--doc-theme-ocean-amb-l"), cssVar("--doc-theme-ocean-amb-d")],
    L: { page: cssVar("--doc-theme-ocean-page-l"), ink: cssVar("--doc-theme-ocean-ink-l"), head: cssVar("--doc-theme-ocean-head-l") }, D: { page: cssVar("--doc-theme-ocean-page-d"), ink: cssVar("--doc-theme-ocean-ink-d"), head: cssVar("--doc-theme-ocean-head-d") } },
  { id: "sand", name: "Sand", motif: "dunes", cv: [cssVar("--doc-theme-sand-cv1"), cssVar("--doc-theme-sand-cv2"), cssVar("--doc-theme-sand-cv3"), cssVar("--doc-theme-sand-cv4"), cssVar("--doc-theme-sand-cv5")], amb: [cssVar("--doc-theme-sand-amb-l"), cssVar("--doc-theme-sand-amb-d")],
    L: { page: cssVar("--doc-theme-sand-page-l"), ink: cssVar("--doc-theme-sand-ink-l"), head: cssVar("--doc-theme-sand-head-l") }, D: { page: cssVar("--doc-theme-sand-page-d"), ink: cssVar("--doc-theme-sand-ink-d"), head: cssVar("--doc-theme-sand-head-d") } },
  { id: "night", name: "Night", motif: "stars", cv: [cssVar("--doc-theme-night-cv1"), cssVar("--doc-theme-night-cv2"), cssVar("--doc-theme-night-cv3"), cssVar("--doc-theme-night-cv4"), cssVar("--doc-theme-night-cv5")], amb: [cssVar("--doc-theme-night-amb-l"), cssVar("--doc-theme-night-amb-d")],
    L: { page: cssVar("--doc-theme-night-page-l"), ink: cssVar("--doc-theme-night-ink-l"), head: cssVar("--doc-theme-night-head-l") }, D: { page: cssVar("--doc-theme-night-page-d"), ink: cssVar("--doc-theme-night-ink-d"), head: cssVar("--doc-theme-night-head-d") } }
];
const dtRgb = (h) => { const n = parseInt(h.slice(1), 16); return ((n >> 16) & 255) + ", " + ((n >> 8) & 255) + ", " + (n & 255); };

/* A doc's style is one JSON object (the database's Doc.style): the page style
   fields, plus `theme` / `ground` for a page still wearing an old preset. */
const dcStyleField = (doc) => (doc && doc.style && typeof doc.style === "object" ? doc.style : {});

/* A cover: an abstract picture from the theme's five colours. */
function DtCover({ t, style }) {
  const raw = React.useId ? React.useId() : String(Math.random());
  const id = "dtc" + raw.replace(/[^a-zA-Z0-9]/g, "");
  const [c0, c1, c2, c3, c4] = t.cv;
  let art = null;
  if (t.motif === "grid") art = <>
    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => [0, 1, 2].map((j) => <rect key={i + "-" + j} x={60 + i * 72} y={36 + j * 56} width={44} height={36} rx={10} fill={(i + j) % 3 ? c3 : c2} opacity={(i * 7 + j * 3) % 5 === 0 ? 0.95 : 0.45} />))}
    <circle cx={640} cy={110} r={54} fill={c4} opacity={0.55} /></>;
  else if (t.motif === "arches") art = <>
    {[[170, 210, c2], [170, 150, c3], [170, 92, c4], [560, 170, c4], [560, 112, c3], [560, 58, c2]].map(([x, r, f], i) => <path key={i} d={"M" + (x - r) + " 220 A" + r + " " + r + " 0 0 1 " + (x + r) + " 220 Z"} fill={f} opacity={0.85} />)}
    <circle cx={380} cy={70} r={22} fill={c4} opacity={0.7} /></>;
  else if (t.motif === "lines") art = <>
    {Array.from({ length: 22 }, (_, i) => <line key={i} x1={i * 44 - 120} y1={240} x2={i * 44 + 80} y2={-20} stroke={c2} strokeWidth={i % 4 ? 1.5 : 5} opacity={i % 4 ? 0.35 : 0.6} />)}
    <circle cx={600} cy={110} r={64} fill="none" stroke={c3} strokeWidth={3} opacity={0.9} />
    <circle cx={600} cy={110} r={30} fill={c4} opacity={0.85} /></>;
  else if (t.motif === "sun") art = <>
    <circle cx={590} cy={118} r={78} fill={c2} />
    <circle cx={590} cy={118} r={112} fill="none" stroke={c4} strokeWidth={2} opacity={0.45} />
    <path d="M0 170 C 120 120, 260 140, 380 165 S 640 200, 800 150 V220 H0 Z" fill={c3} opacity={0.8} />
    <path d="M0 200 C 160 170, 300 190, 460 200 S 700 185, 800 195 V220 H0 Z" fill={c3} />
    <circle cx={160} cy={70} r={10} fill={c4} opacity={0.9} /></>;
  else if (t.motif === "hills") art = <>
    <circle cx={180} cy={70} r={34} fill={c3} />
    <path d="M0 150 C 140 90, 280 100, 420 150 S 680 120, 800 100 V220 H0 Z" fill={c1} />
    <path d="M0 185 C 180 140, 330 160, 500 190 S 720 150, 800 160 V220 H0 Z" fill={c2} />
    <path d="M0 210 C 200 190, 420 200, 800 196 V220 H0 Z" fill={c4} /></>;
  else if (t.motif === "waves") art = <>
    {[[110, c1, 0.7], [140, c2, 0.8], [172, c4, 0.9]].map(([y, f, o], i) => <path key={i} d={"M0 " + y + " C 100 " + (y - 30) + ", 200 " + (y + 30) + ", 300 " + y + " S 500 " + (y - 30) + ", 600 " + y + " S 800 " + (y + 30) + ", 800 " + y + " V220 H0 Z"} fill={f} opacity={o} />)}
    <circle cx={660} cy={56} r={20} fill={c3} /></>;
  else if (t.motif === "dunes") art = <>
    <circle cx={620} cy={78} r={42} fill={c3} />
    <path d="M0 160 Q 200 100, 420 160 T 800 140 V220 H0 Z" fill={c1} />
    <path d="M0 190 Q 260 140, 520 190 T 800 180 V220 H0 Z" fill={c2} />
    <path d="M0 212 Q 300 190, 800 208 V220 H0 Z" fill={c4} opacity={0.85} /></>;
  else art = <>
    {Array.from({ length: 46 }, (_, i) => <circle key={i} cx={(i * 137) % 800} cy={(i * 61) % 200 + 8} r={i % 7 ? 1.4 : 2.6} fill={c3} opacity={i % 3 ? 0.55 : 0.95} />)}
    <circle cx={600} cy={100} r={64} fill="none" stroke={c2} strokeWidth={2} opacity={0.6} />
    <circle cx={600} cy={100} r={42} fill={c4} />
    <circle cx={620} cy={88} r={40} fill={c1} /></>;
  return (
    <svg viewBox="0 0 800 220" preserveAspectRatio="xMidYMid slice" aria-hidden="true" className="docs-fill" style={style}>
      <defs><linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={c0} /><stop offset="1" stopColor={c1} /></linearGradient></defs>
      <rect width="800" height="220" fill={"url(#" + id + ")"} />
      {art}
    </svg>
  );
}

/* ---------- document style, Craft's way (07.10.26) ----------
   A document is a page card floating on a full-bleed backdrop. Its style is
   one object on the doc (docs.patch, persisted):
     { backdrop, page, text, cover, separator, font, wide }
   Old docs carry a theme preset id (or a ground); they read as the matching
   style until the first change writes a real one. Everything is drawn here
   (SVG, CSS, canvas) — no stock images. */
const DC_DEFAULT = { backdrop: "none", page: "white", text: "auto", cover: null, separator: "line", font: "sans", wide: false };

/* Page colours, each with its Light and Dark reading (the split swatch). amb
   is the tint the app's ground takes on when there is no backdrop. */
const DC_PAGES = [
  { id: "white", name: "White", L: cssVar("--doc-page-white-l"), D: cssVar("--doc-page-white-d") },
  { id: "paper", name: "Paper", L: cssVar("--doc-page-paper-l"), D: cssVar("--doc-page-paper-d"), amb: [cssVar("--doc-page-paper-amb-l"), cssVar("--doc-page-paper-amb-d")] },
  { id: "rose", name: "Rose", L: cssVar("--doc-page-rose-l"), D: cssVar("--doc-page-rose-d"), amb: [cssVar("--doc-page-rose-amb-l"), cssVar("--doc-page-rose-amb-d")] },
  { id: "lilac", name: "Lilac", L: cssVar("--doc-page-lilac-l"), D: cssVar("--doc-page-lilac-d"), amb: [cssVar("--doc-page-lilac-amb-l"), cssVar("--doc-page-lilac-amb-d")] },
  { id: "sage", name: "Sage", L: cssVar("--doc-page-sage-l"), D: cssVar("--doc-page-sage-d"), amb: [cssVar("--doc-page-sage-amb-l"), cssVar("--doc-page-sage-amb-d")] },
  { id: "sky", name: "Sky", L: cssVar("--doc-page-sky-l"), D: cssVar("--doc-page-sky-d"), amb: [cssVar("--doc-page-sky-amb-l"), cssVar("--doc-page-sky-amb-d")] },
  { id: "sand", name: "Sand", L: cssVar("--doc-page-sand-l"), D: cssVar("--doc-page-sand-d"), amb: [cssVar("--doc-page-sand-amb-l"), cssVar("--doc-page-sand-amb-d")] },
  { id: "graphite", name: "Graphite", L: cssVar("--doc-page-graphite-l"), D: cssVar("--doc-page-graphite-d") },
  { id: "black", name: "Black", L: cssVar("--doc-page-black-l"), D: cssVar("--doc-page-black-d") }
];
const DC_INK = { dark: cssVar("--doc-ink-dark"), light: cssVar("--doc-ink-light") };
/* Text: auto picks dark or light ink by the page; a hue has a deep and a pale
   reading and takes whichever the page needs, so it stays >= 4.5:1. */
const DC_TEXTS = [
  { id: "auto", name: "Auto" }, { id: "dark", name: "Dark" }, { id: "light", name: "Light" },
  { id: "umber", name: "Umber", dk: cssVar("--doc-text-umber-dk"), lt: cssVar("--doc-text-umber-lt") },
  { id: "wine", name: "Wine", dk: cssVar("--doc-text-wine-dk"), lt: cssVar("--doc-text-wine-lt") },
  { id: "plum", name: "Plum", dk: cssVar("--doc-text-plum-dk"), lt: cssVar("--doc-text-plum-lt") },
  { id: "navy", name: "Navy", dk: cssVar("--doc-text-navy-dk"), lt: cssVar("--doc-text-navy-lt") },
  { id: "forest", name: "Forest", dk: cssVar("--doc-text-forest-dk"), lt: cssVar("--doc-text-forest-lt") }
];
const DC_BACKDROPS = [
  { id: "none", name: "None" }, { id: "sparkle", name: "Sparkle" }, { id: "dunes", name: "Dunes" }, { id: "mist", name: "Mist" },
  { id: "grid", name: "Dotted" }, { id: "ink", name: "Marble" }, { id: "sage", name: "Meadow" }, { id: "ocean", name: "Ocean" }
];
const DC_FONTS = [
  { id: "sans", glyph: "Aa", name: "Default", css: "var(--font-sans)" },
  { id: "serif", glyph: "Ss", name: "Serif", css: "'Newsreader', 'Iowan Old Style', Georgia, serif" },
  { id: "mono", glyph: "00", name: "Mono", css: "var(--font-mono)" },
  { id: "rounded", glyph: "Rr", name: "Rounded", css: "'Nunito', ui-rounded, 'SF Pro Rounded', system-ui, -apple-system, 'Segoe UI', sans-serif" }
];
const DC_COVER_ARTS = ["rose", "sand", "sage", "ocean", "night", "paper", "ink", "default"];
/* "All Styles": every entry is a complete style. Old theme ids map 1:1. */
const DC_PRESETS = [
  { id: "default", name: "Default", style: { backdrop: "none", page: "white", text: "auto", font: "sans" } },
  { id: "paper", name: "Paper", style: { backdrop: "grid", page: "paper", text: "umber", font: "serif" } },
  { id: "ink", name: "Ink", style: { backdrop: "ink", page: "white", text: "auto", font: "sans" } },
  { id: "rose", name: "Rose", style: { backdrop: "dunes", page: "rose", text: "wine", font: "serif" } },
  { id: "sage", name: "Sage", style: { backdrop: "sage", page: "sage", text: "forest", font: "sans" } },
  { id: "ocean", name: "Ocean", style: { backdrop: "ocean", page: "sky", text: "navy", font: "sans" } },
  { id: "sand", name: "Sand", style: { backdrop: "dunes", page: "sand", text: "umber", font: "serif" } },
  { id: "night", name: "Night", style: { backdrop: "ink", page: "black", text: "auto", font: "sans" } },
  { id: "sparkles", name: "Sparkles", style: { backdrop: "sparkle", page: "white", text: "plum", font: "rounded" } },
  { id: "mist", name: "Mist", style: { backdrop: "mist", page: "lilac", text: "plum", font: "rounded" } }
];
const DC_GROUND_MAP = { mist: "mist", sand: "dunes", sage: "sage", stone: "grid" };

/* The resolved style the page draws with. `cover` here is the doc's coverUrl
   (stored on the doc, not inside style) so the drawing code reads one object. */
function dcStyleOf(doc) {
  if (!doc) return DC_DEFAULT;
  const st = dcStyleField(doc);
  const cover = { cover: doc.coverUrl || null };
  if ("backdrop" in st) return Object.assign({}, DC_DEFAULT, st, cover);
  const p = st.theme ? DC_PRESETS.find((x) => x.id === st.theme) : null;
  if (p) return Object.assign({}, DC_DEFAULT, p.style, cover);
  if (st.ground && DC_GROUND_MAP[st.ground]) return Object.assign({}, DC_DEFAULT, { backdrop: DC_GROUND_MAP[st.ground] }, cover);
  return Object.assign({}, DC_DEFAULT, cover);
}

const dcPresetOf = (s) => DC_PRESETS.find((p) => ["backdrop", "page", "text", "font"].every((k) => p.style[k] === s[k])) || null;
const dcPageOf = (id) => DC_PAGES.find((p) => p.id === id) || DC_PAGES[0];
const dcFontOf = (id) => DC_FONTS.find((f) => f.id === id) || DC_FONTS[0];

/* Contrast (WCAG relative luminance). */
function dcLum(h) {
  const n = parseInt(h.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function dcRatio(a, b) { const x = dcLum(a), y = dcLum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
function dcInkFor(page, text) {
  if (text === "dark") return DC_INK.dark;
  if (text === "light") return DC_INK.light;
  const darkPage = dcRatio(page, DC_INK.light) > dcRatio(page, DC_INK.dark);
  const t = DC_TEXTS.find((x) => x.id === text);
  if (t && t.dk) return darkPage ? t.lt : t.dk;
  return darkPage ? DC_INK.light : DC_INK.dark;
}
/* The inline half of a styled page; themes.css (.dt-themed) picks L or D and
   rebuilds the grey ladder from the ink. */
function dcVars(s) {
  const pg = dcPageOf(s.page);
  const il = dcInkFor(pg.L, s.text), id = dcInkFor(pg.D, s.text);
  return { "--dt-page-l": pg.L, "--dt-page-d": pg.D, "--dt-ink-l": dtRgb(il), "--dt-ink-d": dtRgb(id), "--dt-head-l": il, "--dt-head-d": id };
}

/* ---- backdrops ---- */
const dcSvg = (svg) => "url(\"data:image/svg+xml," + encodeURIComponent(svg) + "\") center / cover no-repeat";
function dcRand(seed) { let s = seed % 2147483647; if (s <= 0) s += 2147483646; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
function dcNoise(seed) {
  const r = dcRand(seed), perm = new Uint8Array(512), val = new Float32Array(256);
  for (let i = 0; i < 256; i++) { val[i] = r(); perm[i] = i; }
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const at = (x, y) => val[perm[(x & 255) + perm[y & 255]]];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
function dcFbm(n, x, y) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < 5; i++) { s += a * n(x * f, y * f); f *= 2.03; a *= 0.5; } return s / 0.97; }
const dcHex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
function dcRamp(stops, t) {
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) { const [p0, c0] = stops[i - 1], [p1, c1] = stops[i]; const k = (t - p0) / (p1 - p0 || 1); return [0, 1, 2].map((j) => c0[j] + (c1[j] - c0[j]) * k); }
  }
  return stops[stops.length - 1][1].slice();
}
/* Marbled noise on a canvas: domain-warped fbm through a palette with thin
   veins; "sparkle" adds a glitter of tiny lights. Made once, cached. */
const dcMarbleCache = {};
function dcMarble(kind) {
  if (dcMarbleCache[kind]) return dcMarbleCache[kind];
  let url = "none";
  try {
    const ink = kind === "ink";
    const W = 300, H = 200, c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d"), img = x.createImageData(W, H), n = dcNoise(ink ? 7 : 23);
    const stops = (ink ? [[0, cssVar("--doc-marble-ink-1")], [0.3, cssVar("--doc-marble-ink-2")], [0.5, cssVar("--doc-marble-ink-3")], [0.66, cssVar("--doc-marble-ink-4")], [0.82, cssVar("--doc-marble-ink-5")], [1, cssVar("--doc-marble-ink-6")]]
      : [[0, cssVar("--doc-marble-sparkle-1")], [0.28, cssVar("--doc-marble-sparkle-2")], [0.48, cssVar("--doc-marble-sparkle-3")], [0.68, cssVar("--doc-marble-sparkle-4")], [0.86, cssVar("--doc-marble-sparkle-5")], [1, cssVar("--doc-marble-sparkle-6")]]).map(([p, h]) => [p, dcHex(h)]);
    const vein = dcHex(ink ? cssVar("--doc-marble-ink-vein") : cssVar("--doc-marble-sparkle-vein"));
    for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
      const u = (px / W) * 3.2, v = (py / H) * 2.2;
      const q = dcFbm(n, u + 1.7, v + 9.2), r2 = dcFbm(n, u + 5.2 + 3.6 * q, v + 1.3 + 3.6 * q);
      const t = Math.min(1, Math.max(0, (dcFbm(n, u + 3.8 * r2, v + 3.8 * r2) - 0.22) / 0.56));
      const col = dcRamp(stops, t);
      const ln = Math.pow(1 - Math.abs(Math.sin((t * 9 + r2 * 2) * Math.PI)), ink ? 34 : 22) * (ink ? 0.7 : 0.55);
      const o = (py * W + px) * 4;
      img.data[o] = col[0] + (vein[0] - col[0]) * ln; img.data[o + 1] = col[1] + (vein[1] - col[1]) * ln; img.data[o + 2] = col[2] + (vein[2] - col[2]) * ln; img.data[o + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    const big = document.createElement("canvas"); big.width = 1440; big.height = 960;
    const g = big.getContext("2d"); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high"; g.drawImage(c, 0, 0, 1440, 960);
    const r = dcRand(ink ? 91 : 57);
    const dots = ink ? 2600 : 9000;
    const GL = { warm: cssVar("--doc-glint-warm"), white: cssVar("--doc-glint-white"), pink: cssVar("--doc-glint-pink"), blue: cssVar("--doc-glint-blue") };
    for (let i = 0; i < dots; i++) {
      const big1 = r() > 0.94, rad = big1 ? 1 + r() * 1.3 : 0.35 + r() * 0.7;
      const hue = r();
      g.fillStyle = ink ? GL.warm : hue < 0.7 ? GL.white : hue < 0.85 ? GL.pink : GL.blue;
      g.globalAlpha = ink ? 0.05 + r() * 0.25 : hue < 0.7 ? 0.35 + r() * 0.65 : 0.4 + r() * 0.5;
      g.beginPath(); g.arc(r() * 1440, r() * 960, rad, 0, 6.3); g.fill();
    }
    g.globalAlpha = 1;
    if (!ink) for (let i = 0; i < 46; i++) {
      const cx = r() * 1440, cy = r() * 960, L = 4 + r() * 9;
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, L); gr.addColorStop(0, cssVar("--white-a95")); gr.addColorStop(1, cssVar("--white-a0"));
      g.fillStyle = gr; g.fillRect(cx - L, cy - 0.6, 2 * L, 1.2); g.fillRect(cx - 0.6, cy - L, 1.2, 2 * L);
      g.beginPath(); g.arc(cx, cy, 1.4, 0, 6.3); g.fillStyle = cssVar("--color-white"); g.fill();
    }
    url = "url(\"" + big.toDataURL("image/jpeg", 0.86) + "\") center / cover no-repeat";
  } catch (e) { url = "var(--doc-marble-fallback)"; }
  return (dcMarbleCache[kind] = url);
}
const DC_DIM = "linear-gradient(var(--doc-backdrop-dim), var(--doc-backdrop-dim)), ";
const dcBdCache = {};
/* [light, dark] values for the CSS background shorthand. */
function dcBackdrop(id) {
  if (dcBdCache[id]) return dcBdCache[id];
  let out;
  if (id === "sparkle") { const m = dcMarble("sparkle"); out = [m, "linear-gradient(var(--doc-backdrop-dim-sparkle), var(--doc-backdrop-dim-sparkle)), " + m]; }
  else if (id === "ink") { const m = dcMarble("ink"); out = [m, "linear-gradient(var(--doc-backdrop-dim-ink), var(--doc-backdrop-dim-ink)), " + m]; }
  else if (id === "dunes") {
    const s = dcSvg("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1600 1000' preserveAspectRatio='xMidYMid slice'><defs>"
      + "<linearGradient id='s' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='" + cssVar("--doc-art-dunes-1") + "'/><stop offset='.5' stop-color='" + cssVar("--doc-art-dunes-2") + "'/><stop offset='1' stop-color='" + cssVar("--doc-art-dunes-3") + "'/></linearGradient>"
      + "<radialGradient id='g'><stop offset='0' stop-color='" + cssVar("--doc-art-dunes-4") + "' stop-opacity='.95'/><stop offset='1' stop-color='" + cssVar("--doc-art-dunes-4") + "' stop-opacity='0'/></radialGradient></defs>"
      + "<rect width='1600' height='1000' fill='url(#s)'/><circle cx='1130' cy='420' r='300' fill='url(#g)'/><circle cx='1130' cy='420' r='118' fill='" + cssVar("--doc-art-dunes-5") + "'/>"
      + "<path d='M0 600 C 260 520 540 545 780 610 S 1280 690 1600 570 V1000 H0Z' fill='" + cssVar("--doc-art-dunes-6") + "' opacity='.9'/>"
      + "<path d='M0 710 C 300 640 580 680 880 735 S 1390 715 1600 680 V1000 H0Z' fill='" + cssVar("--doc-art-dunes-7") + "'/>"
      + "<path d='M0 835 C 360 785 700 815 1010 855 S 1460 825 1600 815 V1000 H0Z' fill='" + cssVar("--doc-art-dunes-8") + "'/>"
      + "<path d='M0 935 C 420 895 900 925 1600 905 V1000 H0Z' fill='" + cssVar("--doc-art-dunes-9") + "'/></svg>");
    out = [s, DC_DIM + s];
  } else if (id === "sage") {
    const s = dcSvg("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1600 1000' preserveAspectRatio='xMidYMid slice'><defs>"
      + "<linearGradient id='s' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='" + cssVar("--doc-art-sage-1") + "'/><stop offset='1' stop-color='" + cssVar("--doc-art-sage-2") + "'/></linearGradient></defs>"
      + "<rect width='1600' height='1000' fill='url(#s)'/><circle cx='360' cy='300' r='86' fill='" + cssVar("--doc-art-sage-3") + "'/>"
      + "<path d='M0 560 C 260 470 520 480 800 560 S 1340 520 1600 470 V1000 H0Z' fill='" + cssVar("--doc-art-sage-4") + "'/>"
      + "<path d='M0 690 C 320 600 620 640 900 700 S 1400 620 1600 640 V1000 H0Z' fill='" + cssVar("--doc-art-sage-5") + "'/>"
      + "<path d='M0 820 C 340 760 700 790 1040 830 S 1460 770 1600 790 V1000 H0Z' fill='" + cssVar("--doc-art-sage-6") + "'/>"
      + "<path d='M0 930 C 460 890 980 920 1600 900 V1000 H0Z' fill='" + cssVar("--doc-art-sage-7") + "'/></svg>");
    out = [s, DC_DIM + s];
  } else if (id === "ocean") {
    const wave = (y, a, f, o) => "<path d='M0 " + y + " C 200 " + (y - a) + ", 400 " + (y + a) + ", 600 " + y + " S 1000 " + (y - a) + ", 1200 " + y + " S 1500 " + (y + a) + ", 1600 " + y + " V1000 H0Z' fill='" + f + "' opacity='" + o + "'/>";
    const s = dcSvg("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1600 1000' preserveAspectRatio='xMidYMid slice'><defs>"
      + "<linearGradient id='s' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='" + cssVar("--doc-art-ocean-1") + "'/><stop offset='1' stop-color='" + cssVar("--doc-art-ocean-2") + "'/></linearGradient></defs>"
      + "<rect width='1600' height='1000' fill='url(#s)'/><circle cx='1220' cy='250' r='64' fill='" + cssVar("--doc-art-ocean-3") + "'/>"
      + wave(560, 50, cssVar("--doc-art-ocean-4"), 0.8) + wave(660, 60, cssVar("--doc-art-ocean-5"), 0.85) + wave(780, 55, cssVar("--doc-art-ocean-6"), 0.9) + wave(900, 45, cssVar("--doc-art-ocean-7"), 1) + "</svg>");
    out = [s, DC_DIM + s];
  } else if (id === "mist") {
    out = ["radial-gradient(55% 65% at 12% 18%, var(--doc-art-mist-l-1) 0%, transparent 62%), radial-gradient(50% 60% at 88% 26%, var(--doc-art-mist-l-2) 0%, transparent 62%), radial-gradient(70% 70% at 58% 100%, var(--doc-art-mist-l-3) 0%, transparent 66%), var(--doc-art-mist-l-4)",
      "radial-gradient(55% 65% at 12% 18%, var(--doc-art-mist-d-1) 0%, transparent 62%), radial-gradient(50% 60% at 88% 26%, var(--doc-art-mist-d-2) 0%, transparent 62%), radial-gradient(70% 70% at 58% 100%, var(--doc-art-mist-d-3) 0%, transparent 66%), var(--doc-art-mist-d-4)"];
  } else if (id === "grid") {
    out = ["radial-gradient(circle at 1px 1px, var(--doc-art-grid-dot-l) 1.1px, transparent 1.6px) 0 0 / 18px 18px, var(--doc-art-grid-ground-l)",
      "radial-gradient(circle at 1px 1px, var(--doc-art-grid-dot-d) 1.1px, transparent 1.6px) 0 0 / 18px 18px, var(--doc-art-grid-ground-d)"];
  } else out = ["var(--background)", "var(--background)"];
  return (dcBdCache[id] = out);
}
const dcBdVars = (id) => { const [l, d] = dcBackdrop(id); return { "--dc-bd-l": l, "--dc-bd-d": d }; };

/* Ambient: the page's own tint on the app ground — only without a backdrop,
   which already gives the room its atmosphere. */
function dcAmbientFor(s) {
  if (s.backdrop !== "none") return null;
  const pg = dcPageOf(s.page);
  return pg.amb ? { id: "dc-" + pg.id, amb: pg.amb } : null;
}

/* Fonts: Newsreader and Nunito, linked once. */
function dcLoadFonts() {
  if (document.getElementById("dc-fonts")) return;
  const l = document.createElement("link"); l.id = "dc-fonts"; l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600;6..72,700&family=Nunito:wght@400;600;700;800&display=swap";
  document.head.appendChild(l);
}

/* A cover: an uploaded picture (data URL) or one of the drawn arts. */
function DcCover({ cover, style }) {
  if (!cover) return null;
  if (/^data:|^blob:|^https?:/.test(cover)) return <img src={cover} alt="" draggable={false} className="docs-fill docs-cover-img" style={style} />;
  const t = DT_THEMES.find((x) => "art:" + x.id === cover) || DT_THEMES[3];
  return <span className="dt-cover docs-fill" style={style}><DtCover t={t} /></span>;
}

/* Sorting (08.10.26): the store keeps "20 min ago" / "2 Sep" strings, so the
   grid turns them back into an age. A real updatedAt / createdAt wins when a
   doc has one. */
const DC_MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
function dcAge(v) {
  if (v == null || v === "") return 9e12;
  const t = String(v).trim().toLowerCase();
  let m;
  if (/^just now|^now$/.test(t)) return 0;
  if ((m = t.match(/(\d+)\s*min/))) return m[1] * 6e4;
  if ((m = t.match(/(\d+)\s*(h|hour)/))) return m[1] * 36e5;
  if (t.indexOf("today") === 0) return 36e5;
  if (t.indexOf("yesterday") === 0) return 864e5;
  if ((m = t.match(/(\d+)\s*day/))) return m[1] * 864e5;
  if ((m = t.match(/(\d+)\s*week/))) return m[1] * 6048e5;
  if ((m = t.match(/(\d+)\s*month/))) return m[1] * 2592e6;
  if ((m = t.match(/^(\d{1,2})\s+([a-z]{3})/)) && DC_MON[m[2]] != null) {
    const now = new Date(), d = new Date(now.getFullYear(), DC_MON[m[2]], +m[1]);
    if (d > now) d.setFullYear(d.getFullYear() - 1);
    return now - d;
  }
  const d = Date.parse(v);
  return isNaN(d) ? 9e12 : Math.max(0, Date.now() - d);
}
/* Craft's order in the \u22ef menu: Name, Last viewed, Date created, Date updated. */
const DC_SORTS = [["name", "Name"], ["viewed", "Last viewed"], ["created", "Date created"], ["updated", "Date updated"]];
const dcSortDefault = (key) => (key === "name" ? "asc" : "desc");
const dcDirLabel = (key, dir) => (key === "name" ? (dir === "asc" ? "A to Z" : "Z to A") : (dir === "desc" ? "Newest first" : "Oldest first"));
function dcSortDocs(list, key, dir) {
  const val = (d) => key === "name" ? (d.title || "\uffff").toLowerCase()
    : key === "created" ? (d.createdAt ? dcAge(d.createdAt) : dcAge(d.created))
    : key === "viewed" ? (d.viewedAt ? dcAge(d.viewedAt) : dcAge(d.viewed))
    : (d.updatedAt ? dcAge(d.updatedAt) : dcAge(d.updated));
  const out = list.map((d, i) => [d, val(d), i]);
  out.sort((a, b) => {
    let c = key === "name" ? a[1].localeCompare(b[1]) : a[1] - b[1];
    // An age is the reverse of a date: "newest first" is the smallest age.
    if (key === "name" ? dir === "desc" : dir === "asc") c = -c;
    return c || a[2] - b[2];
  });
  return out.map((x) => x[0]);
}
/* Sort is a per-viewer convenience, kept in this browser (needt.docsSort). */
const DC_SORT_KEY = "needt.docsSort";
function dcReadSort() {
  const v = window.needtSync ? window.needtSync.get(DC_SORT_KEY) : null;
  if (v && DC_SORTS.some((x) => x[0] === v.key) && (v.dir === "asc" || v.dir === "desc")) return v;
  return { key: "updated", dir: "desc" };
}

/* ---------- rich text: spans (09.10.26) ----------
   A text block's slot 2 is RICH TEXT — either a plain string (no marks:
   every older page, unchanged) or an array of spans:
     [{ t: "words", b?, i?, s?, code?, href?, color?, hl?, at? }]
   b / i / s / code are true when set; href is a link (http(s): / mailto:);
   at is a mention — the person's email, the words are "@Name" (dx-at,
   data-dx-at in an editor);
   color is a Choose-a-Color id (DX_COLORS → --pdc2-c-<id>); hl a highlight id
   (DX_HLS → --dsp-hl-<id>). The stored form is canonical (dxNorm): adjacent
   spans with equal marks merged, empty spans dropped, and text with no marks
   is a plain string again — a page only changes shape where words carry
   marks. One exception: a lone empty span with marks ([{ t: "", b: true }])
   is an empty line that keeps its marks for the first words typed into it.
   The phone's older block-level format (4th slot { b, i, s, color }) reads as
   marks over the whole text (dxMigrateBlock) and is written back as spans.
   Editors draw the spans with spansToHtml into a contenteditable
   ("plaintext-only") and read them back with dxFromEditor; offsets are
   plain-text offsets (dxRangeIn / dxSelect). Read-only views use renderSpans.
   Everything here accepts any rich value (string | spans | null). */
const DX_MARKS = ["b", "i", "s", "code", "href", "color", "hl", "at"];
const DX_BOOL = { b: 1, i: 1, s: 1, code: 1 };
const DX_TEXT_KINDS = { p: 1, h: 1, li: 1, todo: 1, quote: 1, callout: 1, code: 1, lead: 1, task: 1, event: 1, habit: 1, ask: 1 };
/* Choose a Color (the phone's 6 × 3; "default" = the page's own ink). */
const DX_COLORS = [["default", "Default"], ["gray", "Gray"], ["brown", "Brown"], ["red", "Red"], ["orange", "Orange"], ["amber", "Amber"],
  ["yellow", "Yellow"], ["lime", "Lime"], ["green", "Green"], ["teal", "Teal"], ["cyan", "Cyan"], ["sky", "Sky"],
  ["blue", "Blue"], ["indigo", "Indigo"], ["violet", "Violet"], ["purple", "Purple"], ["pink", "Pink"], ["rose", "Rose"]];
/* Highlights: a soft wash behind the words, the ink stays the page's. */
const DX_HLS = [["yellow", "Yellow"], ["orange", "Orange"], ["red", "Red"], ["pink", "Pink"], ["purple", "Purple"], ["blue", "Blue"], ["green", "Green"], ["gray", "Gray"]];
const DX_COLOR_IDS = DX_COLORS.reduce((o, c) => (o[c[0]] = 1, o), {});
const DX_HL_IDS = DX_HLS.reduce((o, c) => (o[c[0]] = 1, o), {});

/* A link the page may hold: http(s) or mailto; a bare domain gets https. */
function dxSafeHref(h) {
  const v = String(h == null ? "" : h).trim();
  if (!v) return null;
  if (/^(https?:\/\/|mailto:)/i.test(v)) return v;
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(v)) return "https://" + v;
  return null;
}
/* The marks of one span, cleaned: only known keys, booleans as true. */
function dxMarksOf(sp) {
  const m = {};
  if (!sp || typeof sp !== "object") return m;
  DX_MARKS.forEach((k) => {
    const v = sp[k];
    if (v == null || v === false || v === "") return;
    if (DX_BOOL[k]) m[k] = true;
    else if (k === "href") { const h = dxSafeHref(v); if (h) m.href = h; }
    else if (k === "color") { if (v !== "default" && DX_COLOR_IDS[v]) m.color = v; }
    else if (k === "hl") { if (DX_HL_IDS[v]) m.hl = v; }
    else if (k === "at") { if (typeof v === "string" && v.trim()) m.at = v.trim(); }
  });
  return m;
}
const dxHasAny = (m) => Object.keys(m).length > 0;
const dxSame = (a, b) => DX_MARKS.every((k) => (a[k] || null) === (b[k] || null));

/* Any rich value → a spans array (always an array). fmt: an old block-level
   format whose b / i / s / color become marks under each span's own. */
function toSpans(v, fmt) {
  let out;
  if (Array.isArray(v)) out = v.filter((x) => x && typeof x === "object").map((x) => Object.assign({ t: x.t == null ? "" : String(x.t) }, dxMarksOf(x)));
  else out = [{ t: v == null ? "" : String(v) }];
  if (fmt && typeof fmt === "object") {
    const add = dxMarksOf({ b: fmt.b, i: fmt.i, s: fmt.s, color: fmt.color });
    if (dxHasAny(add)) out = out.map((x) => Object.assign({ t: x.t }, add, dxMarksOf(x)));
  }
  return out;
}
/* The stored form: merged, no empty spans, a plain string when unmarked. */
function dxNorm(v) {
  const src = toSpans(v), out = [];
  src.forEach((x) => {
    if (!x.t) return;
    const l = out[out.length - 1];
    if (l && dxSame(l, x)) l.t += x.t; else out.push(Object.assign({}, x));
  });
  if (!out.length) { const m = src.map(dxMarksOf).filter(dxHasAny)[0]; return m ? [Object.assign({ t: "" }, m)] : ""; }
  if (out.length === 1 && !dxHasAny(dxMarksOf(out[0]))) return out[0].t;
  return out;
}
const spansToText = (v) => (Array.isArray(v) ? v.map((x) => (x && x.t != null ? String(x.t) : "")).join("") : v == null ? "" : typeof v === "string" ? v : String(v));
/* Pieces of the text, keeping marks (raw arrays; dxNorm before storing). */
function dxCut(v, a, b) {
  const out = []; let pos = 0;
  const hi0 = b == null ? Infinity : b;
  toSpans(v).forEach((x) => {
    const s = pos, e = pos + x.t.length; pos = e;
    const lo = Math.max(a, s), hi = Math.min(hi0, e);
    if (hi > lo) out.push(Object.assign({}, x, { t: x.t.slice(lo - s, hi - s) }));
  });
  return out;
}
const sliceSpans = (v, a, b) => dxNorm(dxCut(v, a, b));
function concatSpans() {
  let out = [];
  for (let i = 0; i < arguments.length; i++) out = out.concat(toSpans(arguments[i]).filter((x) => x.t));
  return dxNorm(out);
}
/* Replace [start, end) with plain words; they take the marks of the
   character before them (or after, at the very start). */
function spliceText(v, start, end, str) {
  const sp = toSpans(v), len = spansToText(sp).length;
  const a = Math.max(0, Math.min(start, len)), b = Math.max(a, Math.min(end == null ? a : end, len));
  const near = dxCut(sp, a > 0 ? a - 1 : a, a > 0 ? a : a + 1)[0] || sp[0] || { t: "" };
  return dxNorm(dxCut(sp, 0, a).concat(str ? [Object.assign({}, dxMarksOf(near), { t: String(str) })] : [], dxCut(sp, b)));
}
/* The marks every character in [start, end) shares. An empty range (or an
   empty line) reads the marks at that spot. */
function marksIn(v, start, end) {
  const sp = toSpans(v), len = spansToText(sp).length;
  let a = Math.max(0, Math.min(start == null ? 0 : start, len)), b = Math.max(0, Math.min(end == null ? len : end, len));
  if (b < a) { const t = a; a = b; b = t; }
  if (b === a) {
    if (!len) return sp.length ? dxMarksOf(sp[0]) : {};
    const at = dxCut(sp, a > 0 ? a - 1 : 0, a > 0 ? a : 1)[0];
    return at ? dxMarksOf(at) : {};
  }
  let res = null;
  dxCut(sp, a, b).forEach((x) => {
    const m = dxMarksOf(x);
    if (!res) { res = m; return; }
    Object.keys(res).forEach((k) => { if (res[k] !== m[k]) delete res[k]; });
  });
  return res || {};
}
/* Set (value), clear (null / false / "" / "default") or toggle (undefined:
   on unless every character already has it) one mark over [start, end). */
function applyMark(v, start, end, mark, value) {
  const sp = toSpans(v), len = spansToText(sp).length;
  let a = Math.max(0, Math.min(start, len)), b = Math.max(0, Math.min(end, len));
  if (b < a) { const t = a; a = b; b = t; }
  if (!len) {
    /* an empty line keeps the marks for what is typed next */
    const m = dxMarksOf(sp[0] || {});
    const on = value === undefined ? !m[mark] : value;
    const y = Object.assign({ t: "" }, m);
    if (on == null || on === false || on === "" || (mark === "color" && on === "default")) delete y[mark]; else y[mark] = DX_BOOL[mark] ? true : on;
    return dxNorm([y]);
  }
  if (b === a) return dxNorm(sp);
  const on = value === undefined ? !marksIn(sp, a, b)[mark] : value;
  const mid = dxCut(sp, a, b).map((x) => {
    const y = Object.assign({}, x);
    if (on == null || on === false || on === "" || (mark === "color" && on === "default")) delete y[mark];
    else y[mark] = DX_BOOL[mark] ? true : on;
    return y;
  });
  return dxNorm(dxCut(sp, 0, a).concat(mid, dxCut(sp, b)));
}

/* Drawing. Classes (docs.css .dx-*): dx-b / dx-i / dx-s / dx-code / dx-a,
   dx-c-<color> (ink), dx-h-<hl> (wash). */
function dxClassOf(m) {
  const c = ["dx"];
  if (m.b) c.push("dx-b"); if (m.i) c.push("dx-i"); if (m.s) c.push("dx-s"); if (m.code) c.push("dx-code");
  if (m.href) c.push("dx-a"); if (m.color) c.push("dx-c-" + m.color); if (m.hl) c.push("dx-h-" + m.hl); if (m.at) c.push("dx-at");
  return c.join(" ");
}
/* Read-only: React nodes (a plain string stays a string). Links open in a
   new tab; noLinks (miniatures, whose click opens the page) draws them as
   words only. */
function renderSpans(v, noLinks) {
  if (!Array.isArray(v)) return v == null ? "" : v;
  return toSpans(v).map((x, i) => {
    const m = dxMarksOf(x);
    if (!dxHasAny(m)) return x.t;
    if (m.href && !noLinks) return <a key={i} className={dxClassOf(m)} href={m.href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>{x.t}</a>;
    return <span key={i} className={dxClassOf(m)} data-dx-at={m.at || undefined} title={m.at || undefined}>{x.t}</span>;
  });
}
const dxEsc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/* For an editor: the same drawing as an HTML string. */
function spansToHtml(v) {
  if (!Array.isArray(v)) return dxEsc(v == null ? "" : v);
  return toSpans(v).map((x) => {
    if (!x.t) return "";
    const m = dxMarksOf(x);
    if (!dxHasAny(m)) return dxEsc(x.t);
    return m.href ? "<a class=\"" + dxClassOf(m) + "\" href=\"" + dxEsc(m.href) + "\">" + dxEsc(x.t) + "</a>"
      : "<span class=\"" + dxClassOf(m) + "\"" + (m.at ? " data-dx-at=\"" + dxEsc(m.at) + "\"" : "") + ">" + dxEsc(x.t) + "</span>";
  }).join("");
}
/* Markdown for export: **b** *i* ~~s~~ `code` [t](href); colour and highlight have no Markdown. */
function spansToMarkdown(v) {
  if (!Array.isArray(v)) return v == null ? "" : String(v);
  return toSpans(v).map((x) => {
    const m = dxMarksOf(x);
    let t = x.t;
    if (!t) return "";
    if (m.code) t = "`" + t + "`";
    if (m.b) t = "**" + t + "**";
    if (m.i) t = "*" + t + "*";
    if (m.s) t = "~~" + t + "~~";
    if (m.href) t = "[" + t + "](" + m.href + ")";
    return t;
  }).join("");
}
/* The DOM of an editor → spans. Reads the dx-* classes, plus the plain tags
   (b / strong, i / em, s / del / strike, code, a) and inline weight / style /
   line-through a browser may leave behind. */
function dxNodeMarks(node, root) {
  const m = {};
  for (let n = node; n && n !== root && n.nodeType === 1; n = n.parentNode) {
    const tag = n.tagName, cl = n.classList;
    if (tag === "B" || tag === "STRONG" || cl.contains("dx-b")) m.b = true;
    if (tag === "I" || tag === "EM" || cl.contains("dx-i")) m.i = true;
    if (tag === "S" || tag === "DEL" || tag === "STRIKE" || cl.contains("dx-s")) m.s = true;
    if (tag === "CODE" || cl.contains("dx-code")) m.code = true;
    if (tag === "A" && !m.href && n.getAttribute("href")) m.href = n.getAttribute("href");
    if (!m.at && n.getAttribute("data-dx-at")) m.at = n.getAttribute("data-dx-at");
    for (let i = 0; i < cl.length; i++) {
      const c = cl[i];
      if (!m.color && c.indexOf("dx-c-") === 0) m.color = c.slice(5);
      else if (!m.hl && c.indexOf("dx-h-") === 0) m.hl = c.slice(5);
    }
    const st = n.style;
    if (st) {
      if (st.fontWeight === "bold" || parseInt(st.fontWeight, 10) >= 600) m.b = true;
      if (st.fontStyle === "italic") m.i = true;
      if (/line-through/.test(st.textDecorationLine || st.textDecoration || "")) m.s = true;
    }
  }
  return dxMarksOf(m);
}
function domToSpans(root) {
  const out = [];
  if (!root) return "";
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) if (n.data) out.push(Object.assign({ t: n.data }, dxNodeMarks(n.parentNode, root)));
  return dxNorm(out);
}
/* An editor's text after an input: its DOM — and a line that was empty with
   marks (applyMark on an empty line) gives them to the first words typed,
   redrawn at once so the next keystroke lands inside the marked span. */
function dxFromEditor(el, prev) {
  const next = domToSpans(el);
  if (!(Array.isArray(prev) && prev.length === 1 && !prev[0].t && typeof next === "string" && next)) return next;
  const out = dxNorm([Object.assign({}, dxMarksOf(prev[0]), { t: next })]);
  if (el.isConnected) {
    const s = window.getSelection();
    const off = s && s.rangeCount && el.contains(s.anchorNode) ? dxPoint(el, s.anchorNode, s.anchorOffset) : next.length;
    el.innerHTML = spansToHtml(out);
    if (document.activeElement === el) dxSelect(el, off, off);
  }
  return out;
}
/* Selection ⇄ plain-text offsets inside one editor. */
function dxPoint(root, node, off) {
  const r = document.createRange();
  try { r.setStart(root, 0); r.setEnd(node, off); } catch (e) { return 0; }
  return r.toString().length;
}
/* The part of a range inside one editor as { start, end } (clipped to it), or null. */
function dxRangeIn(root, range) {
  if (!root || !range) return null;
  try { if (!range.intersectsNode(root)) return null; } catch (e) { return null; }
  const len = root.textContent.length;
  const s = root.contains(range.startContainer) ? dxPoint(root, range.startContainer, range.startOffset) : 0;
  const e = root.contains(range.endContainer) ? dxPoint(root, range.endContainer, range.endOffset) : len;
  return { start: Math.min(s, e), end: Math.max(s, e) };
}
function dxLocate(root, off) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n, rem = Math.max(0, off), last = null;
  while ((n = w.nextNode())) { last = n; if (rem <= n.data.length) return [n, rem]; rem -= n.data.length; }
  return last ? [last, last.data.length] : [root, 0];
}
/* Select [start, end) in one editor, or from (rootA, start) to (rootB, end). */
function dxSelect(rootA, start, end, rootB) {
  if (!rootA) return;
  const a = dxLocate(rootA, start), b = dxLocate(rootB || rootA, end == null ? start : end);
  const r = document.createRange();
  try { r.setStart(a[0], a[1]); r.setEnd(b[0], b[1]); } catch (e) { return; }
  const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
}
/* Old block-level format → spans (text kinds only); anything else, and every
   plain unformatted block, comes back as the very same array. */
function dxMigrateBlock(a) {
  if (!Array.isArray(a) || !DX_TEXT_KINDS[a[0]]) return a;
  const f = a[3] && typeof a[3] === "object" ? a[3] : null;
  const old = !!f && ["b", "i", "s", "color"].some((k) => k in f);
  if (!old && !Array.isArray(a[1])) return a;
  const out = a.slice();
  out[1] = dxNorm(toSpans(a[1], old ? f : null));
  if (old) {
    const nf = {};
    Object.keys(f).forEach((k) => { if (["b", "i", "s", "color"].indexOf(k) < 0 && f[k] != null && f[k] !== false && f[k] !== "") nf[k] = f[k]; });
    if (Object.keys(nf).length) out[3] = nf; else out.length = Math.min(out.length, 3);
  }
  while (out.length > 2 && out[out.length - 1] == null) out.pop();
  return out;
}
const dxMigrateBody = (body) => (Array.isArray(body) ? body.map(dxMigrateBlock) : body);
/* A block's words as plain text (search, outline, summaries). */
const dxText = (a) => (a ? spansToText(a[1]) : "");

Object.assign(window, { DX_MARKS, DX_COLORS, DX_HLS, DX_TEXT_KINDS, toSpans, dxNorm, spansToText, sliceSpans, concatSpans, spliceText, marksIn, applyMark,
  renderSpans, spansToHtml, spansToMarkdown, domToSpans, dxFromEditor, dxRangeIn, dxSelect, dxSafeHref, dxMigrateBlock, dxMigrateBody, dxText });

Object.assign(window, { DT_THEMES, DtCover, DcCover, dcStyleField, dcStyleOf, dcPageOf, dcFontOf, dcInkFor, dcVars, dcBackdrop, dcBdVars, dcAmbientFor, dcLoadFonts,
  DC_DEFAULT, DC_PRESETS, DC_PAGES, DC_TEXTS, DC_BACKDROPS, DC_FONTS, DC_COVER_ARTS,
  dcAge, DC_SORTS, dcSortDefault, dcDirLabel, dcSortDocs, DC_SORT_KEY, dcReadSort });
