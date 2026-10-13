/**
 * Document backdrops (prototype doc-style.jsx 186–298): each id resolves to a
 * [light, dark] pair of CSS `background` values, set as `--dc-bd-l` /
 * `--dc-bd-d` on a `.dc-bd` element (app.css picks the side). Everything is
 * drawn here — SVG, gradients, a canvas for the marbles — from themes.css
 * tokens, no stock images. Results are cached per id and theme reading.
 */
import type { TokenReader } from "./style";

const svgUrl = (svg: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(svg)}") center / cover no-repeat`;

function rand(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function noise(seed: number) {
  const r = rand(seed);
  const perm = new Uint8Array(512);
  const val = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    val[i] = r();
    perm[i] = i;
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = perm[i];
    perm[i] = perm[j];
    perm[j] = t;
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const at = (x: number, y: number) => val[perm[(x & 255) + perm[y & 255]]];
  return (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = at(xi, yi);
    const b = at(xi + 1, yi);
    const c = at(xi, yi + 1);
    const d = at(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

function fbm(n: (x: number, y: number) => number, x: number, y: number) {
  let s = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < 5; i++) {
    s += a * n(x * f, y * f);
    f *= 2.03;
    a *= 0.5;
  }
  return s / 0.97;
}

const hex = (h: string) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];

function ramp(stops: [number, number[]][], t: number) {
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [p0, c0] = stops[i - 1];
      const [p1, c1] = stops[i];
      const k = (t - p0) / (p1 - p0 || 1);
      return [0, 1, 2].map((j) => c0[j] + (c1[j] - c0[j]) * k);
    }
  }
  return stops[stops.length - 1][1].slice();
}

const marbleCache: Record<string, string> = {};

/**
 * Marbled noise on a canvas: domain-warped fbm through the palette with thin
 * veins; "sparkle" adds a glitter of tiny lights. Made once, cached; drawn
 * only in the browser (a server render gets the token fallback).
 */
function marble(kind: "ink" | "sparkle", read: TokenReader) {
  if (marbleCache[kind]) return marbleCache[kind];
  if (typeof document === "undefined" || !read(`--doc-marble-${kind}-1`)) {
    return "var(--doc-marble-fallback)";
  }
  let url = "var(--doc-marble-fallback)";
  try {
    const ink = kind === "ink";
    const W = 300;
    const H = 200;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const x = c.getContext("2d");
    if (!x) throw new Error("no 2d context");
    const img = x.createImageData(W, H);
    const n = noise(ink ? 7 : 23);
    const pos = ink
      ? [0, 0.3, 0.5, 0.66, 0.82, 1]
      : [0, 0.28, 0.48, 0.68, 0.86, 1];
    const stops = pos.map(
      (p, i) =>
        [p, hex(read(`--doc-marble-${kind}-${i + 1}`))] as [number, number[]]
    );
    const vein = hex(read(`--doc-marble-${kind}-vein`));
    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        const u = (px / W) * 3.2;
        const v = (py / H) * 2.2;
        const q = fbm(n, u + 1.7, v + 9.2);
        const r2 = fbm(n, u + 5.2 + 3.6 * q, v + 1.3 + 3.6 * q);
        const t = Math.min(
          1,
          Math.max(0, (fbm(n, u + 3.8 * r2, v + 3.8 * r2) - 0.22) / 0.56)
        );
        const col = ramp(stops, t);
        const ln =
          Math.pow(
            1 - Math.abs(Math.sin((t * 9 + r2 * 2) * Math.PI)),
            ink ? 34 : 22
          ) * (ink ? 0.7 : 0.55);
        const o = (py * W + px) * 4;
        img.data[o] = col[0] + (vein[0] - col[0]) * ln;
        img.data[o + 1] = col[1] + (vein[1] - col[1]) * ln;
        img.data[o + 2] = col[2] + (vein[2] - col[2]) * ln;
        img.data[o + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
    const big = document.createElement("canvas");
    big.width = 1440;
    big.height = 960;
    const g = big.getContext("2d");
    if (!g) throw new Error("no 2d context");
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = "high";
    g.drawImage(c, 0, 0, 1440, 960);
    const r = rand(ink ? 91 : 57);
    const glint = {
      warm: read("--doc-glint-warm"),
      white: read("--doc-glint-white"),
      pink: read("--doc-glint-pink"),
      blue: read("--doc-glint-blue"),
    };
    const dots = ink ? 2600 : 9000;
    for (let i = 0; i < dots; i++) {
      const large = r() > 0.94;
      const rad = large ? 1 + r() * 1.3 : 0.35 + r() * 0.7;
      const h = r();
      g.fillStyle = ink
        ? glint.warm
        : h < 0.7
          ? glint.white
          : h < 0.85
            ? glint.pink
            : glint.blue;
      g.globalAlpha = ink
        ? 0.05 + r() * 0.25
        : h < 0.7
          ? 0.35 + r() * 0.65
          : 0.4 + r() * 0.5;
      g.beginPath();
      g.arc(r() * 1440, r() * 960, rad, 0, 6.3);
      g.fill();
    }
    g.globalAlpha = 1;
    if (!ink) {
      for (let i = 0; i < 46; i++) {
        const cx = r() * 1440;
        const cy = r() * 960;
        const L = 4 + r() * 9;
        const gr = g.createRadialGradient(cx, cy, 0, cx, cy, L);
        gr.addColorStop(0, read("--white-a95"));
        gr.addColorStop(1, read("--white-a0"));
        g.fillStyle = gr;
        g.fillRect(cx - L, cy - 0.6, 2 * L, 1.2);
        g.fillRect(cx - 0.6, cy - L, 1.2, 2 * L);
        g.beginPath();
        g.arc(cx, cy, 1.4, 0, 6.3);
        g.fillStyle = read("--color-white");
        g.fill();
      }
    }
    url = `url("${big.toDataURL("image/jpeg", 0.86)}") center / cover no-repeat`;
  } catch {
    url = "var(--doc-marble-fallback)";
  }
  return (marbleCache[kind] = url);
}

const DIM =
  "linear-gradient(var(--doc-backdrop-dim), var(--doc-backdrop-dim)), ";

function artSvg(id: "dunes" | "sage" | "ocean", read: TokenReader) {
  const v = (n: number) => read(`--doc-art-${id}-${n}`);
  const head =
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1600 1000' preserveAspectRatio='xMidYMid slice'><defs>";
  if (id === "dunes") {
    return svgUrl(
      head +
        `<linearGradient id='s' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${v(1)}'/><stop offset='.5' stop-color='${v(2)}'/><stop offset='1' stop-color='${v(3)}'/></linearGradient>` +
        `<radialGradient id='g'><stop offset='0' stop-color='${v(4)}' stop-opacity='.95'/><stop offset='1' stop-color='${v(4)}' stop-opacity='0'/></radialGradient></defs>` +
        `<rect width='1600' height='1000' fill='url(#s)'/><circle cx='1130' cy='420' r='300' fill='url(#g)'/><circle cx='1130' cy='420' r='118' fill='${v(5)}'/>` +
        `<path d='M0 600 C 260 520 540 545 780 610 S 1280 690 1600 570 V1000 H0Z' fill='${v(6)}' opacity='.9'/>` +
        `<path d='M0 710 C 300 640 580 680 880 735 S 1390 715 1600 680 V1000 H0Z' fill='${v(7)}'/>` +
        `<path d='M0 835 C 360 785 700 815 1010 855 S 1460 825 1600 815 V1000 H0Z' fill='${v(8)}'/>` +
        `<path d='M0 935 C 420 895 900 925 1600 905 V1000 H0Z' fill='${v(9)}'/></svg>`
    );
  }
  if (id === "sage") {
    return svgUrl(
      head +
        `<linearGradient id='s' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${v(1)}'/><stop offset='1' stop-color='${v(2)}'/></linearGradient></defs>` +
        `<rect width='1600' height='1000' fill='url(#s)'/><circle cx='360' cy='300' r='86' fill='${v(3)}'/>` +
        `<path d='M0 560 C 260 470 520 480 800 560 S 1340 520 1600 470 V1000 H0Z' fill='${v(4)}'/>` +
        `<path d='M0 690 C 320 600 620 640 900 700 S 1400 620 1600 640 V1000 H0Z' fill='${v(5)}'/>` +
        `<path d='M0 820 C 340 760 700 790 1040 830 S 1460 770 1600 790 V1000 H0Z' fill='${v(6)}'/>` +
        `<path d='M0 930 C 460 890 980 920 1600 900 V1000 H0Z' fill='${v(7)}'/></svg>`
    );
  }
  const wave = (y: number, a: number, f: string, o: number) =>
    `<path d='M0 ${y} C 200 ${y - a}, 400 ${y + a}, 600 ${y} S 1000 ${y - a}, 1200 ${y} S 1500 ${y + a}, 1600 ${y} V1000 H0Z' fill='${f}' opacity='${o}'/>`;
  return svgUrl(
    head +
      `<linearGradient id='s' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='${v(1)}'/><stop offset='1' stop-color='${v(2)}'/></linearGradient></defs>` +
      `<rect width='1600' height='1000' fill='url(#s)'/><circle cx='1220' cy='250' r='64' fill='${v(3)}'/>` +
      wave(560, 50, v(4), 0.8) +
      wave(660, 60, v(5), 0.85) +
      wave(780, 55, v(6), 0.9) +
      wave(900, 45, v(7), 1) +
      "</svg>"
  );
}

const cache = new Map<string, [string, string]>();

/** [light, dark] CSS background values for a backdrop id. */
export function backdropOf(id: string, read: TokenReader): [string, string] {
  const hit = cache.get(id);
  if (hit) return hit;
  let out: [string, string];
  if (id === "sparkle" || id === "ink") {
    const m = marble(id, read);
    out = [
      m,
      `linear-gradient(var(--doc-backdrop-dim-${id}), var(--doc-backdrop-dim-${id})), ${m}`,
    ];
  } else if (id === "dunes" || id === "sage" || id === "ocean") {
    const s = artSvg(id, read);
    out = [s, DIM + s];
  } else if (id === "mist") {
    const g = (side: "l" | "d") =>
      `radial-gradient(55% 65% at 12% 18%, var(--doc-art-mist-${side}-1) 0%, transparent 62%), radial-gradient(50% 60% at 88% 26%, var(--doc-art-mist-${side}-2) 0%, transparent 62%), radial-gradient(70% 70% at 58% 100%, var(--doc-art-mist-${side}-3) 0%, transparent 66%), var(--doc-art-mist-${side}-4)`;
    out = [g("l"), g("d")];
  } else if (id === "grid") {
    const g = (side: "l" | "d") =>
      `radial-gradient(circle at 1px 1px, var(--doc-art-grid-dot-${side}) 1.1px, transparent 1.6px) 0 0 / 18px 18px, var(--doc-art-grid-ground-${side})`;
    out = [g("l"), g("d")];
  } else {
    out = ["var(--background)", "var(--background)"];
  }
  // A drawn backdrop needs real token values; don't cache an unread one.
  if (read("--doc-art-dunes-1")) cache.set(id, out);
  return out;
}

export function backdropVars(id: string, read: TokenReader) {
  const [l, d] = backdropOf(id, read);
  return { "--dc-bd-l": l, "--dc-bd-d": d } as Record<string, string>;
}
