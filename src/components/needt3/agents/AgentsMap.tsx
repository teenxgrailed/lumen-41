"use client";

import {
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { createPortal } from "react-dom";
import { FiMaximize2, FiMinimize2, FiMonitor, FiShuffle } from "react-icons/fi";

import { useV3PortalContainer } from "../ctx/PortalScope";
import { AgentIcon } from "./AgentIcon";
import {
  type AgentStatus,
  BLUE,
  BLUE_WHITE,
  type MapInput,
  type MapScene,
  type Rgb,
  STATUS_HUE,
  WHITE,
  buildMapScene,
  mix,
  nodeLabel,
} from "./map-scene";

/** One breath for everything calm in the product (PORT.md §6). */
const BREATH_S = 5.2;
/** Breathing per status: red pulses fast and strong, orange gently. */
const PERIOD: Record<AgentStatus, number> = {
  alert: 1.6,
  waiting: 3.4,
  working: 5.2,
  ok: 5.2,
};
const AMP: Record<AgentStatus, number> = {
  alert: 1.55,
  waiting: 1,
  working: 1,
  ok: 0.85,
};
/** Pulses per second leaving an agent, by status. */
const RATE: Record<AgentStatus, number> = {
  alert: 1.3,
  waiting: 0.5,
  working: 0.6,
  ok: 0.32,
};
/** 30 frames a second: the motion is slow, the budget is not. */
const FRAME_MS = 1000 / 30;
/** The scene draws itself in over this long on arrival. */
const ENTRY_MS = 1800;
/** The cached layers repaint in turn on this beat (each every 2 beats). */
const LAYER_MS = 250;
/** Thread sway in px: small, so a layer 0.5 s old does not show it. */
const SWAY = 6;
/** The mean parallax depth: a cached layer moves by it between repaints. */
const Z_MEAN = 0.75;
/** Mesh line alpha and width: rest (edge, centre), lit, bright. */
const BA: [number, number][] = [
  [0.17, 0.5],
  [0.32, 0.7],
  [0.42, 0.5],
  [0.58, 0.75],
  [0.82, 0.95],
  [0.96, 1.15],
];
/** A new mood every 13 s, crossfading over about 2.5 s. */
const MOOD_MS = 13_000;
const MOOD_TAU_S = 0.9;
/** Weights: pulses, the light wave's speed, the glow, how often forms appear. */
const MOODS: readonly [number, number, number, number][] = [
  [1, 1, 1, 1],
  [1.9, 1.7, 1.1, 0.8],
  [0.7, 0.75, 1.35, 1.9],
];
const NIGHT = "#050507";
const MAX_PULSES = 46;
/** The legend says what the colours mean, then gets out of the way. */
const LEGEND_MS = 8000;

const rgba = (c: Rgb, a: number) =>
  `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const easeOut = (u: number) => 1 - Math.pow(1 - u, 3);

function bez(
  x0: number,
  y0: number,
  c1x: number,
  c1y: number,
  c2x: number,
  c2y: number,
  x1: number,
  y1: number,
  t: number
) {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [
    a * x0 + b * c1x + c * c2x + d * x1,
    a * y0 + b * c1y + c * c2y + d * y1,
  ] as const;
}

function reducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/* ---------- sprites, drawn once ---------- */

function canvasOf(w: number, h: number) {
  const el = document.createElement("canvas");
  el.width = w;
  el.height = h;
  return { el, g: el.getContext("2d") };
}

const sprites = new Map<string, HTMLCanvasElement>();
/** A soft round glow in one colour, stamped with drawImage. */
function glowOf(col: Rgb) {
  const key = col.join(",");
  const hit = sprites.get(key);
  if (hit) return hit;
  const { el, g } = canvasOf(128, 128);
  if (g) {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, rgba(mix(col, [255, 255, 255], 0.55), 0.95));
    gr.addColorStop(0.22, rgba(col, 0.4));
    gr.addColorStop(1, rgba(col, 0));
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  }
  sprites.set(key, el);
  return el;
}
const GLOW_WHITE: Rgb = [170, 210, 255];

let thumbArt: HTMLCanvasElement[] | null = null;
/** Six neutral thumbnails: doc, mail, calendar, picture, glow, code. */
function thumbs() {
  if (thumbArt) return thumbArt;
  const out: HTMLCanvasElement[] = [];
  const mk = (fn: (g: CanvasRenderingContext2D) => void) => {
    const { el, g } = canvasOf(88, 64);
    if (g) {
      g.beginPath();
      if (typeof g.roundRect === "function") g.roundRect(1, 1, 86, 62, 6);
      else g.rect(1, 1, 86, 62);
      g.save();
      g.clip();
      fn(g);
      g.restore();
      g.strokeStyle = "rgba(255,255,255,.28)";
      g.lineWidth = 1;
      g.stroke();
    }
    out.push(el);
  };
  mk((g) => {
    g.fillStyle = "rgba(232,238,252,.9)";
    g.fillRect(0, 0, 88, 64);
    g.fillStyle = "rgba(40,52,80,.85)";
    g.fillRect(10, 10, 40, 5);
    g.fillStyle = "rgba(40,52,80,.35)";
    for (let i = 0; i < 5; i++)
      g.fillRect(10, 22 + i * 8, 68 - (i % 2) * 18, 3);
  });
  mk((g) => {
    g.fillStyle = "rgba(18,24,40,.92)";
    g.fillRect(0, 0, 88, 64);
    g.strokeStyle = "rgba(190,215,255,.7)";
    g.lineWidth = 1.4;
    g.strokeRect(14, 16, 60, 34);
    g.beginPath();
    g.moveTo(14, 16);
    g.lineTo(44, 36);
    g.lineTo(74, 16);
    g.stroke();
  });
  mk((g) => {
    g.fillStyle = "rgba(236,241,255,.92)";
    g.fillRect(0, 0, 88, 64);
    g.fillStyle = "rgba(70,110,200,.9)";
    g.fillRect(0, 0, 88, 16);
    g.fillStyle = "rgba(30,40,70,.55)";
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 6; c++) g.fillRect(8 + c * 13, 24 + r * 12, 7, 6);
  });
  mk((g) => {
    const gr = g.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, "#1a2a4a");
    gr.addColorStop(1, "#06080f");
    g.fillStyle = gr;
    g.fillRect(0, 0, 88, 64);
    g.fillStyle = "rgba(210,225,255,.85)";
    g.beginPath();
    g.arc(60, 18, 6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "rgba(14,20,36,.95)";
    g.beginPath();
    g.moveTo(0, 64);
    g.lineTo(22, 34);
    g.lineTo(40, 50);
    g.lineTo(62, 28);
    g.lineTo(88, 56);
    g.lineTo(88, 64);
    g.fill();
  });
  mk((g) => {
    const gr = g.createRadialGradient(44, 32, 2, 44, 32, 44);
    gr.addColorStop(0, "#cfe4ff");
    gr.addColorStop(0.35, "#3e78d8");
    gr.addColorStop(1, "#070b16");
    g.fillStyle = gr;
    g.fillRect(0, 0, 88, 64);
  });
  mk((g) => {
    g.fillStyle = "rgba(8,10,16,.95)";
    g.fillRect(0, 0, 88, 64);
    const cs = [
      "rgba(120,170,255,.8)",
      "rgba(220,230,255,.75)",
      "rgba(150,160,190,.6)",
    ];
    for (let i = 0; i < 6; i++) {
      g.fillStyle = cs[i % 3];
      g.fillRect(8 + (i % 3) * 8, 9 + i * 8.4, 14 + ((i * 29) % 40), 3.2);
    }
  });
  thumbArt = out;
  return out;
}

let waveArt: HTMLCanvasElement | null = null;
/** A small voice wave riding in with the data. */
function wave() {
  if (waveArt) return waveArt;
  const { el, g } = canvasOf(260, 70);
  if (g) {
    let s = 7;
    const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    g.strokeStyle = "rgba(235,242,255,.95)";
    g.lineWidth = 1.6;
    g.beginPath();
    for (let x = 4; x < 256; x += 3) {
      const env = Math.exp(-Math.pow((x - 120) / 70, 2));
      const h = (3 + r() * 30) * env + 1;
      g.moveTo(x, 35 - h);
      g.lineTo(x, 35 + h);
    }
    g.stroke();
  }
  waveArt = el;
  return el;
}

/**
 * The neutral rows of data on the far left: a type for everyone, and the
 * owner's own title only outside Presentation.
 */
function rowsArt(scene: MapScene, presentation: boolean) {
  const w = Math.round(scene.width * (scene.phone ? 0.5 : 0.3));
  const { el, g } = canvasOf(
    Math.max(1, w),
    Math.max(1, Math.round(scene.height))
  );
  if (!g) return el;
  const lh = scene.phone ? 12 : 15;
  g.font = `${scene.phone ? 9 : 10.5}px ui-monospace, "SF Mono", Menlo, monospace`;
  g.textBaseline = "top";
  let k = 0;
  for (let y = 6; y < scene.height - 10; y += lh) {
    const row = scene.rows[k++ % scene.rows.length];
    const text =
      !presentation && row.title ? `${row.type} · ${row.title}` : row.type;
    const ind = (k * 37) % 5 < 2 ? 0 : (k * 13) % 30;
    g.fillStyle = `rgba(${k % 4 === 0 ? "150,195,255" : "205,218,245"},${0.28 + ((k * 17) % 42) / 100})`;
    g.fillText(text.slice(0, 20 + (k % 14)), 6 + ind, y);
  }
  g.globalCompositeOperation = "destination-in";
  const m = g.createLinearGradient(0, 0, w, 0);
  m.addColorStop(0, "#000");
  m.addColorStop(0.55, "rgba(0,0,0,.55)");
  m.addColorStop(1, "transparent");
  g.fillStyle = m;
  g.fillRect(0, 0, w, scene.height);
  const v = g.createLinearGradient(0, 0, 0, scene.height);
  [0, 0.3, 0.36, 0.62, 0.68, 0.8, 0.91].forEach((s, i) =>
    v.addColorStop(
      s,
      i === 2 || i === 3
        ? "rgba(0,0,0,.18)"
        : i === 6
          ? "rgba(0,0,0,0)"
          : "#000"
    )
  );
  g.fillStyle = v;
  g.fillRect(0, 0, w, scene.height);
  return el;
}

export interface Live {
  hover: number;
  pointer: { x: number; y: number } | null;
  moved: boolean;
  presentation: boolean;
}

/**
 * The drawing loop for one scene (the owner's final reference). Returns
 * its controls. Batched: the converging threads in one glow and one core
 * stroke per kind, the lines in six brightness paths and twelve status
 * paths; only hovered lines, pulses and the entry draw-in stroke alone.
 */
export function startLoop(
  ctx: CanvasRenderingContext2D,
  scene: MapScene,
  dprStart: number,
  live: Live,
  hooks: {
    onHover: (index: number, x: number, y: number) => void;
    /** Each frame: where each agent's label goes (screen px) and its alpha. */
    onAgents?: (pos: { i: number; x: number; y: number; a: number }[]) => void;
  },
  /**
   * Carried across rebuilds of the same layout (new data, full screen): the
   * entry does not replay and the mood does not reset. Mutated in place.
   */
  clock: {
    born: number;
    mood: number;
    moodAt: number;
    /** Learned by adaptive quality; kept across rebuilds. */
    dpr?: number;
    frameMs?: number;
    lite?: boolean;
  } = {
    born: performance.now(),
    mood: 0,
    moodAt: performance.now(),
  }
) {
  const { nodes, edges, threads, adj, core, pills, riders } = scene;
  const W = scene.width;
  const H = scene.height;
  const N = nodes.length;
  const still = reducedMotion();
  // A phone rasterises the canvas on a slow CPU (perf, iPhone 13 at 4x):
  // fewer frames, no additive blending, fewer glows.
  // Adaptive quality: while frames run slow for 0.6 s (the script takes
  // over 22 ms, or frames land 40% later than asked, which is where a
  // software raster shows), the resolution steps down to 1, then the light
  // drawing a phone uses, then the resolution to 0.75 and 0.5, then the
  // frame rate. The scene is not rebuilt.
  let lite = scene.phone || !!clock.lite;
  let dpr = Math.min(dprStart, clock.dpr ?? dprStart);
  let frameMs = Math.max(lite ? 1000 / 24 : FRAME_MS, clock.frameMs ?? 0);
  if (dpr !== dprStart) {
    ctx.canvas.width = Math.round(W * dpr);
    ctx.canvas.height = Math.round(H * dpr);
  }
  let ema = 0;
  let gapEma = 0;
  let slowSince = 0;
  const degrade = (now: number) => {
    const resize = (to: number) => {
      dpr = to;
      ctx.canvas.width = Math.round(W * dpr);
      ctx.canvas.height = Math.round(H * dpr);
      fitLayers();
    };
    if (dpr > 1) {
      resize(Math.max(1, Math.round((dpr - 0.25) * 4) / 4));
    } else if (!lite) {
      lite = true;
    } else if (dpr > 0.5) {
      // Below 1 the glow softens; the labels and pills are DOM and stay sharp.
      resize(dpr > 0.75 ? 0.75 : 0.5);
    } else if (frameMs < 1000 / 20) {
      frameMs = 1000 / 20;
    }
    clock.dpr = dpr;
    clock.lite = lite;
    clock.frameMs = frameMs;
    slowSince = now;
    ema = 0;
    gapEma = 0;
  };
  const px = new Float32Array(N);
  const py = new Float32Array(N);
  const lit = new Float32Array(N);
  const hit = new Float32Array(N);
  const reveal = new Float32Array(N);
  const stOf = (i: number): AgentStatus => (i >= 0 ? nodes[i].status : "ok");
  let rows = rowsArt(scene, live.presentation);
  let rowsFor = live.presentation;
  const art = thumbs();
  const waveImg = wave();
  const agentT = scene.agents.map(() => Math.random());

  const mood = { cur: [...MOODS[clock.mood % MOODS.length]] };
  const rings: { t0: number; n: number }[] = [];
  const pulses: {
    cur: number;
    prev: number;
    e: number;
    u: number;
    v: number;
    hops: number;
    st: AgentStatus;
    str: number;
  }[] = [];
  const forms: { set: number[]; links: [number, number][]; t0: number }[] = [];
  let nextRing = clock.born + 3500;
  let nextForm = clock.born + 2500;
  const mouse = { px: 0, py: 0 };
  let raf = 0;
  let last = 0;
  let lastT = 0;
  let running = false;
  let drift = { dx: 0, dy: 0 };

  // The cached layers (see the frame): null where a canvas cannot make
  // another context (tests), and then both are painted into the frame.
  const layerOf = () => {
    try {
      const { g } = canvasOf(ctx.canvas.width, ctx.canvas.height);
      return g;
    } catch {
      return null;
    }
  };
  const lb = layerOf();
  const lt = lb ? layerOf() : null;
  const layers = lb && lt ? { base: lb, threads: lt } : null;
  const fitLayers = () => {
    if (!layers) return;
    for (const g of [layers.base, layers.threads]) {
      g.canvas.width = ctx.canvas.width;
      g.canvas.height = ctx.canvas.height;
    }
  };
  const base = {
    slot: -1,
    hover: -2,
    dpr: 0,
    rows: null as HTMLCanvasElement | null,
    ox: 0,
    oy: 0,
  };
  const threadAt = { t: 0, ox: 0, oy: 0 };
  const tpx = new Float32Array(N);
  const tpy = new Float32Array(N);
  const curve = (
    th: (typeof threads)[number],
    sw: number,
    X: Float32Array,
    Y: Float32Array
  ) => {
    const O = th.kind === "O";
    return [
      O ? X[th.node] : th.x0,
      O ? Y[th.node] : th.y0,
      th.c1x,
      th.c1y + sw,
      th.c2x + sw * 0.5,
      th.c2y - sw,
      O ? th.x3 : X[th.node],
      O ? th.y3 : Y[th.node],
    ] as const;
  };

  /** Background, data rows, the mesh at rest and the nodes. */
  const paintBase = (
    c: CanvasRenderingContext2D,
    t: number,
    age: number,
    ease: number,
    breath: number,
    mG: number,
    hset: Set<number> | null
  ) => {
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.globalCompositeOperation = "source-over";
    c.globalAlpha = 1;
    c.setLineDash([]);
    c.fillStyle = NIGHT;
    c.fillRect(0, 0, W, H);
    // White base and the soft blue glow, brightest at the core.
    c.save();
    c.translate(core.x + drift.dx * 0.4, core.y + drift.dy * 0.4);
    c.scale(0.5, 1);
    let g = c.createRadialGradient(0, 0, 0, 0, 0, core.ry * 1.25);
    g.addColorStop(0, rgba(BLUE_WHITE, (0.22 + 0.07 * breath) * mG * ease));
    g.addColorStop(0.4, rgba(BLUE, 0.07 * mG * ease));
    g.addColorStop(1, "rgba(90,169,255,0)");
    c.fillStyle = g;
    c.fillRect(-core.rx * 8, -core.ry * 1.4, core.rx * 16, core.ry * 2.8);
    c.restore();
    g = c.createRadialGradient(
      core.x * 0.5,
      H * 0.5,
      0,
      core.x * 0.5,
      H * 0.5,
      Math.max(W, H) * 0.8
    );
    g.addColorStop(0, "rgba(90,169,255,.035)");
    g.addColorStop(1, "rgba(90,169,255,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);

    // Incoming data: faint neutral rows, far left.
    c.globalAlpha =
      (0.7 + 0.12 * Math.sin(t * 0.6)) * clamp(age * 2) * (lite ? 0.4 : 1);
    c.drawImage(rows, 0, 0, rows.width, rows.height);
    c.globalAlpha = 1;
    c.globalCompositeOperation = lite ? "source-over" : "lighter";

    // Mesh lines at rest: two brightness paths (centre, edge); those near
    // an agent in status paths (its colour, fading with distance). Red,
    // lit and hovered lines are drawn live on top.
    const plain = [new Path2D(), new Path2D()];
    const tinted = new Map<string, Path2D>();
    for (let e = 0; e < edges.length; e++) {
      const E = edges[e];
      const rv = Math.min(reveal[E.a], reveal[E.b]);
      if (rv <= 0 || (hset && hset.has(e))) continue;
      if (E.sw > 0.03) {
        const st = stOf(E.sa);
        if (st === "alert") continue;
        const level = E.sw > 0.66 ? 2 : E.sw > 0.33 ? 1 : 0;
        const key = `${st}:${level}:${rv < 1 ? 0 : 1}`;
        let path = tinted.get(key);
        if (!path) {
          path = new Path2D();
          tinted.set(key, path);
        }
        path.moveTo(px[E.a], py[E.a]);
        path.lineTo(px[E.b], py[E.b]);
        continue;
      }
      const bi = E.d < 0.5 ? 1 : 0;
      plain[bi].moveTo(px[E.a], py[E.a]);
      plain[bi].lineTo(px[E.b], py[E.b]);
    }
    const shim = 1 + 0.18 * Math.sin(t * 0.9);
    for (let bi = 0; bi < 2; bi++) {
      c.strokeStyle = rgba([170, 205, 255], 1);
      c.globalAlpha = clamp(BA[bi][0] * shim * (1 + 0.12 * breath) * ease);
      c.lineWidth = BA[bi][1];
      c.stroke(plain[bi]);
    }
    for (const [key, path] of tinted) {
      const [st, lv, full] = key.split(":") as [AgentStatus, string, string];
      const sw = (Number(lv) + 0.5) / 3;
      c.strokeStyle = rgba(mix(WHITE, STATUS_HUE[st], sw * 0.75), 1);
      c.globalAlpha = clamp((0.14 + sw * 0.38) * (full === "1" ? 1 : 0.5));
      c.lineWidth = 0.5 + sw * 0.5;
      c.stroke(path);
    }

    // Nodes: very bright whites in the middle, glow on the big ones, tinted
    // toward the nearest agent's status.
    for (let i = 0; i < N; i++) {
      const n = nodes[i];
      if (reveal[i] <= 0 || n.kind === "agent" || n.kind === "anchor") continue;
      const cen = 1 - Math.min(1, n.d);
      const tw = still ? 0 : 0.12 * Math.sin(t * 1.3 + n.phase);
      const a = clamp((0.5 + 0.5 * cen + tw) * reveal[i] * (n.real ? 1 : 0.85));
      const r = n.r * (0.5 + 0.5 * reveal[i]);
      const col =
        n.sw > 0.02 ? mix(WHITE, STATUS_HUE[stOf(n.sa)], n.sw * 0.45) : WHITE;
      c.fillStyle = rgba(col, 1);
      c.globalAlpha = a;
      c.beginPath();
      c.arc(px[i], py[i], r, 0, Math.PI * 2);
      c.fill();
      if (!lite && r > 1.7) {
        const s = r * 5 * reveal[i];
        c.globalAlpha = (0.3 + 0.4 * cen) * reveal[i];
        c.drawImage(
          n.sw > 0.45 ? glowOf(STATUS_HUE[stOf(n.sa)]) : glowOf(GLOW_WHITE),
          px[i] - s,
          py[i] - s,
          s * 2,
          s * 2
        );
      }
    }
    c.globalAlpha = 1;
  };

  /** The thread bodies: a soft glow and a bright core per kind. */
  const paintThreads = (
    c: CanvasRenderingContext2D,
    t: number,
    tr: number,
    mP: number,
    clear: boolean
  ) => {
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (clear) {
      c.globalCompositeOperation = "source-over";
      c.clearRect(0, 0, W, H);
    }
    c.globalCompositeOperation = lite ? "source-over" : "lighter";
    tpx.set(px);
    tpy.set(py);
    c.lineCap = "round";
    const inGrad = c.createLinearGradient(0, 0, core.x, 0);
    inGrad.addColorStop(0, rgba(BLUE_WHITE, 0.03));
    inGrad.addColorStop(0.55, rgba(BLUE_WHITE, 0.22));
    inGrad.addColorStop(1, rgba(WHITE, 0.7));
    const outGrad = c.createLinearGradient(core.x, 0, W, 0);
    outGrad.addColorStop(0, rgba(BLUE_WHITE, 0.4));
    outGrad.addColorStop(1, rgba(BLUE_WHITE, 0.03));
    const pathIn = new Path2D();
    const pathOut = new Path2D();
    for (const th of threads) {
      const rev = still ? 1 : clamp((tr - th.delay) / (1 - th.delay));
      if (rev <= 0) continue;
      const sw = still ? 0 : Math.sin(t * 0.5 + th.sway) * SWAY;
      const cv = curve(th, sw, tpx, tpy);
      if (rev < 1) {
        // Drawing itself in: this one strokes alone with a growing dash.
        c.setLineDash([th.len * rev, th.len * 3]);
        c.strokeStyle = th.kind === "O" ? outGrad : inGrad;
        c.globalAlpha = th.alpha * 1.6;
        c.lineWidth = th.width;
        c.beginPath();
        c.moveTo(cv[0], cv[1]);
        c.bezierCurveTo(cv[2], cv[3], cv[4], cv[5], cv[6], cv[7]);
        c.stroke();
        c.setLineDash([]);
        continue;
      }
      const path = th.kind === "O" ? pathOut : pathIn;
      path.moveTo(cv[0], cv[1]);
      path.bezierCurveTo(cv[2], cv[3], cv[4], cv[5], cv[6], cv[7]);
    }
    for (const [path, grad] of [
      [pathIn, inGrad],
      [pathOut, outGrad],
    ] as const) {
      c.strokeStyle = grad;
      c.lineWidth = 2.4;
      c.globalAlpha = 0.22 * (0.9 + 0.1 * mP);
      c.stroke(path);
      c.lineWidth = 0.75;
      c.globalAlpha = 0.9 * (0.9 + 0.1 * mP);
      c.stroke(path);
    }
    c.globalAlpha = 1;
  };

  const frame = (now: number) => {
    const t = still ? 3.2 : (now - clock.born) / 1000;
    const dt = Math.min(0.05, Math.max(0, t - lastT)) || 0.016;
    lastT = t;
    const age = still ? 1 : clamp((now - clock.born) / ENTRY_MS);
    const ease = easeOut(age);
    if (rowsFor !== live.presentation) {
      rows = rowsArt(scene, live.presentation);
      rowsFor = live.presentation;
    }

    if (!still && now - clock.moodAt > MOOD_MS) {
      clock.moodAt = now;
      clock.mood =
        (clock.mood + 1 + Math.floor(Math.random() * 2)) % MOODS.length;
    }
    const target = MOODS[clock.mood % MOODS.length];
    const blend = 1 - Math.exp(-dt / MOOD_TAU_S);
    for (let k = 0; k < 4; k++)
      mood.cur[k] += (target[k] - mood.cur[k]) * blend;
    const [mP, mW, mG, mF] = mood.cur;
    const breath = 0.5 + 0.5 * Math.sin((t * Math.PI * 2) / BREATH_S);

    const p = live.pointer;
    const k = 1 - Math.exp(-dt / 0.4);
    mouse.px += ((p ? p.x / W - 0.5 : 0) - mouse.px) * k;
    mouse.py += ((p ? p.y / H - 0.5 : 0) - mouse.py) * k;
    const OX = still ? 0 : Math.sin(t * 0.045) * 8 - mouse.px * 20;
    const OY = still ? 0 : Math.cos(t * 0.038) * 6 - mouse.py * 14;
    drift = { dx: OX, dy: OY };

    // Positions, the light wave, rings from the agents.
    const front = -1.7 + ((t * 0.08 * mW) % 1) * 3.6;
    while (rings.length && now - rings[0].t0 > 2800) rings.shift();
    if (!still && now > nextRing && scene.agents.length) {
      rings.push({
        t0: now,
        n: scene.agents[Math.floor(Math.random() * scene.agents.length)],
      });
      nextRing = now + (3200 + Math.random() * 2600) / mW;
    }
    for (let i = 0; i < N; i++) {
      const n = nodes[i];
      const s = 1 + 0.015 * Math.sin((t * Math.PI * 2) / BREATH_S + n.d * 2);
      const x = core.x + (n.x - core.x) * s;
      const y = core.y + (n.y - core.y) * s;
      px[i] = x + OX * n.z;
      py[i] = y + OY * n.z;
      const u =
        ((n.x - core.x) * 0.25 + (n.y - core.y) * 0.97) / (core.ry * 1.25);
      let l = still ? 0 : Math.exp(-(((u - front) / 0.14) ** 2)) * 0.85;
      for (const r of rings) {
        const rr = ((now - r.t0) / 1000) * 170;
        const dd = Math.hypot(x - nodes[r.n].x, y - nodes[r.n].y);
        l = Math.max(
          l,
          Math.exp(-(((dd - rr) / 22) ** 2)) * (1 - (now - r.t0) / 2800) * 0.9
        );
      }
      hit[i] *= 0.94;
      lit[i] = Math.max(l, hit[i]);
      reveal[i] =
        n.kind === "agent"
          ? clamp(age * 2.4 - 0.35)
          : n.kind === "anchor"
            ? clamp(age * 2 - 0.4)
            : clamp(clamp(age * 1.6 - n.d * 0.55) * 2.5);
    }

    // What barely changes is painted into two cached layers: the base
    // (background, data rows, the mesh at rest, the nodes) and the thread
    // bodies. Each is repainted every 500 ms, a quarter second apart, so a
    // repaint stays short; on every frame both are laid down with the
    // parallax moved since. During the entry, on a hover change or a new
    // resolution both are repainted at once.
    const tr = clamp(age * 1.25);
    const hset = live.hover >= 0 ? new Set(adj[live.hover]) : null;
    const fresh =
      still ||
      age < 1 ||
      base.hover !== live.hover ||
      base.dpr !== dpr ||
      base.rows !== rows;
    const slot = Math.floor(now / LAYER_MS);
    if (!layers || fresh || slot !== base.slot) {
      const both = !layers || fresh;
      if (both || slot % 2 === 0) {
        paintBase(layers ? layers.base : ctx, t, age, ease, breath, mG, hset);
        base.ox = OX;
        base.oy = OY;
      }
      if (both || slot % 2 === 1) {
        paintThreads(layers ? layers.threads : ctx, t, tr, mP, !!layers);
        threadAt.t = t;
        threadAt.ox = OX;
        threadAt.oy = OY;
      }
      base.slot = slot;
      base.hover = live.hover;
      base.dpr = dpr;
      base.rows = rows;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.setLineDash([]);
    if (layers) {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
      ctx.drawImage(
        layers.base.canvas,
        (OX - base.ox) * Z_MEAN,
        (OY - base.oy) * Z_MEAN,
        W,
        H
      );
      ctx.globalCompositeOperation = lite ? "source-over" : "lighter";
      ctx.drawImage(
        layers.threads.canvas,
        (OX - threadAt.ox) * Z_MEAN,
        (OY - threadAt.oy) * Z_MEAN,
        W,
        H
      );
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = lite ? "source-over" : "lighter";

    // Thumbnails and the voice wave: they shrink and fade into the core.
    if (age > 0.35) {
      const fin = clamp((age - 0.35) * 2.2);
      const tx0 = core.x - core.rx;
      const sc = lite ? 0.55 : 1;
      for (const rd of riders) {
        const u = still
          ? clamp(rd.offset * 0.95 + 0.02)
          : (t * rd.speed + rd.offset) % 1;
        const x = lerp(-70, tx0, u);
        const y = lerp(
          H * rd.lane,
          core.y + (H * rd.lane - core.y) * 0.3,
          Math.pow(u, 1.7)
        );
        const s = 1 - 0.82 * Math.pow(u, 1.15);
        const a = Math.min(1, u * 12) * (1 - clamp((u - 0.86) / 0.14));
        if (a <= 0.01) continue;
        if (rd.kind === "thumb") {
          const w = 66 * sc * s;
          ctx.globalAlpha = a * 0.58 * fin;
          ctx.drawImage(
            art[rd.type % art.length],
            x - w / 2,
            y - (w * 0.73) / 2,
            w,
            w * 0.73
          );
        } else {
          const w = 230 * sc * s;
          const h = 62 * sc * (0.4 + 0.6 * s);
          ctx.globalAlpha = a * 0.8 * fin;
          ctx.drawImage(waveImg, x - w / 2, y - h / 2, w, h);
        }
      }
      ctx.globalAlpha = 1;
    }

    // Particles ride the thread bodies as they were painted.
    if (!still) {
      const spr = glowOf(GLOW_WHITE);
      const dx = (OX - threadAt.ox) * Z_MEAN;
      const dy = (OY - threadAt.oy) * Z_MEAN;
      const sw = (th: (typeof threads)[number]) =>
        Math.sin(threadAt.t * 0.5 + th.sway) * SWAY;
      for (let i = 0; i < threads.length; i += lite ? 2 : 1) {
        const th = threads[i];
        if (clamp((tr - th.delay) / (1 - th.delay)) < 1) continue;
        const c = curve(th, sw(th), tpx, tpy);
        const ph = (t * th.speed * mP + th.offset) % 1;
        const [bx, by] = bez(
          c[0],
          c[1],
          c[2],
          c[3],
          c[4],
          c[5],
          c[6],
          c[7],
          ph
        );
        ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.7 + 0.1;
        ctx.drawImage(spr, bx + dx - 5, by + dy - 5, 10, 10);
      }
      ctx.globalAlpha = 1;
    }

    // Live lines: what the wave and the rings light (on top of the base),
    // the red ones (they pulse), the hovered ones.
    const shim = 1 + 0.18 * Math.sin(t * 0.9);
    const glowPaths = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
    const glowUsed = new Uint8Array(4);
    const red: Path2D[] = [new Path2D(), new Path2D(), new Path2D()];
    const redUsed = new Uint8Array(3);
    const hot: number[] = [];
    for (let e = 0; e < edges.length; e++) {
      const E = edges[e];
      const rv = Math.min(reveal[E.a], reveal[E.b]);
      if (rv <= 0) continue;
      if (hset && hset.has(e)) {
        hot.push(e);
        continue;
      }
      if (E.sw > 0.03) {
        if (stOf(E.sa) !== "alert") continue;
        const level = E.sw > 0.66 ? 2 : E.sw > 0.33 ? 1 : 0;
        red[level].moveTo(px[E.a], py[E.a]);
        red[level].lineTo(px[E.b], py[E.b]);
        redUsed[level] = 1;
        continue;
      }
      const l = Math.max(lit[E.a], lit[E.b]);
      if (l <= 0.12) continue;
      const bi = (l > 0.4 ? 1 : 0) * 2 + (E.d < 0.5 ? 1 : 0);
      glowPaths[bi].moveTo(px[E.a], py[E.a]);
      glowPaths[bi].lineTo(px[E.b], py[E.b]);
      glowUsed[bi] = 1;
    }
    for (let k = 0; k < 4; k++) {
      if (!glowUsed[k]) continue;
      const bi = k + 2;
      const rest = BA[bi % 2];
      ctx.strokeStyle = rgba(bi >= 4 ? [200, 225, 255] : [185, 215, 255], 1);
      ctx.globalAlpha = clamp(
        (BA[bi][0] - rest[0]) * shim * (1 + 0.12 * breath) * ease
      );
      ctx.lineWidth = BA[bi][1];
      ctx.stroke(glowPaths[k]);
    }
    for (let lv = 0; lv < 3; lv++) {
      if (!redUsed[lv]) continue;
      const sw = (lv + 0.5) / 3;
      const pulse = 0.55 + 0.25 * Math.sin((t * Math.PI * 2) / PERIOD.alert);
      ctx.strokeStyle = rgba(mix(WHITE, STATUS_HUE.alert, sw * 0.75), 1);
      ctx.globalAlpha = clamp(0.14 + sw * pulse);
      ctx.lineWidth = 0.5 + sw * 0.5;
      ctx.stroke(red[lv]);
    }
    for (const e of hot) {
      const E = edges[e];
      ctx.strokeStyle = rgba(BLUE_WHITE, 1);
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(px[E.a], py[E.a]);
      ctx.lineTo(px[E.b], py[E.b]);
      ctx.stroke();
    }

    // Pulses from each agent at its status's rate, in its colour, whitening
    // along the chain.
    if (!still && age > 0.8) {
      scene.agents.forEach((ni, ai) => {
        const st = nodes[ni].status;
        agentT[ai] -= dt * RATE[st] * mP;
        if (agentT[ai] > 0 || pulses.length >= (lite ? 20 : MAX_PULSES)) return;
        agentT[ai] = 0.6 + Math.random() * 1.2;
        pulses.push({
          cur: ni,
          prev: -1,
          e: -1,
          u: 1,
          v:
            (st === "alert" ? 2.6 : st === "waiting" ? 1.5 : 1.9) +
            Math.random() * 0.6,
          hops: 0,
          st,
          str: st === "alert" ? 1.35 : 1,
        });
      });
    }
    for (let i = pulses.length - 1; i >= 0; i--) {
      const pl = pulses[i];
      if (pl.u >= 1) {
        if (pl.e >= 0) {
          const E = edges[pl.e];
          pl.prev = pl.cur;
          pl.cur = E.a === pl.cur ? E.b : E.a;
          hit[pl.cur] = Math.max(hit[pl.cur], pl.st === "alert" ? 1 : 0.8);
        }
        const next = adj[pl.cur].filter(
          (k2) => edges[k2].a !== pl.prev && edges[k2].b !== pl.prev
        );
        if (!next.length || pl.hops++ > 9) {
          pulses.splice(i, 1);
          continue;
        }
        pl.e = next[Math.floor(Math.random() * next.length)];
        pl.u = 0;
      }
      pl.u += dt * pl.v * 1.4;
      const E = edges[pl.e];
      const a = pl.cur;
      const b = E.a === pl.cur ? E.b : E.a;
      const u = Math.min(1, pl.u);
      const x = lerp(px[a], px[b], u);
      const y = lerp(py[a], py[b], u);
      const back = Math.max(0, u - 0.4);
      const col = mix(STATUS_HUE[pl.st], WHITE, clamp(pl.hops / 9) * 0.9);
      ctx.strokeStyle = rgba(mix(col, [255, 255, 255], 0.35), 1);
      ctx.globalAlpha = Math.min(1, 0.8 * pl.str);
      ctx.lineWidth = 1.4 * pl.str;
      ctx.beginPath();
      ctx.moveTo(lerp(px[a], px[b], back), lerp(py[a], py[b], back));
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = rgba(col, 1);
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      ctx.arc(x, y, 1.7 * pl.str, 0, Math.PI * 2);
      ctx.fill();
    }

    // Small constellations form and fade.
    if (!still && now > nextForm && age > 0.9) {
      const mids = nodes
        .map((n, i) =>
          n.kind !== "agent" && n.kind !== "anchor" && n.d < 0.85 ? i : -1
        )
        .filter((i) => i >= 0);
      const c = mids[Math.floor(Math.random() * mids.length)];
      if (c !== undefined) {
        const R = lite ? 50 : 70;
        const set = mids
          .map(
            (i) =>
              [
                i,
                Math.hypot(nodes[i].x - nodes[c].x, nodes[i].y - nodes[c].y),
              ] as const
          )
          .filter(([, d]) => d < R)
          .sort((p1, p2) => p1[1] - p2[1])
          .slice(0, 8)
          .map(([i]) => i);
        const links: [number, number][] = [];
        set.forEach((a, ai) => {
          const b = set[(ai + 1) % set.length];
          if (a !== b) links.push([a, b]);
        });
        forms.push({ set, links, t0: now });
      }
      nextForm = now + (3800 + Math.random() * 2400) / mF;
    }
    while (forms.length && now - forms[0].t0 > 3600) forms.shift();
    for (const f of forms) {
      const u = (now - f.t0) / 3600;
      const a = Math.pow(Math.sin(Math.PI * u), 1.4);
      const grow = Math.min(1, u * 3.2);
      ctx.strokeStyle = rgba(mix(WHITE, BLUE_WHITE, 0.45), 1);
      ctx.globalAlpha = 0.8 * a;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const [p1, q1] of f.links) {
        ctx.moveTo(px[p1], py[p1]);
        ctx.lineTo(lerp(px[p1], px[q1], grow), lerp(py[p1], py[q1], grow));
      }
      ctx.stroke();
      if (!lite) {
        ctx.globalAlpha = a;
        const spr = glowOf(GLOW_WHITE);
        for (const n of f.set)
          ctx.drawImage(
            spr,
            px[n] - 11 * a - 2,
            py[n] - 11 * a - 2,
            22 * a + 4,
            22 * a + 4
          );
      }
    }

    // Lit nodes: the wave, rings and pulses brighten them over the base.
    for (let i = 0; i < N; i++) {
      const L = lit[i];
      if (L <= 0.05 || reveal[i] <= 0) continue;
      const n = nodes[i];
      if (n.kind === "agent" || n.kind === "anchor") continue;
      const r = n.r * (1 + 0.55 * L) * (0.5 + 0.5 * reveal[i]);
      ctx.fillStyle = rgba(mix(WHITE, BLUE_WHITE, L * 0.7), 1);
      ctx.globalAlpha = clamp(0.6 * L * reveal[i]);
      ctx.beginPath();
      ctx.arc(px[i], py[i], r, 0, Math.PI * 2);
      ctx.fill();
      if (!lite && L > 0.35) {
        const s = (r * 5 + 14 * L) * reveal[i];
        ctx.globalAlpha = L * 0.4 * reveal[i];
        ctx.drawImage(glowOf(GLOW_WHITE), px[i] - s, py[i] - s, s * 2, s * 2);
      }
    }

    // Agents: a halo and breathing rings in the status colour; red pulses
    // faster and stronger, orange gently, blue and green calmly on 5.2 s.
    const labels: { i: number; x: number; y: number; a: number }[] = [];
    scene.agents.forEach((i, ai) => {
      const n = nodes[i];
      const ap = reveal[i];
      if (ap <= 0) return;
      const st = n.status;
      const c = STATUS_HUE[st];
      const per = PERIOD[st];
      const am = AMP[st];
      const hov = live.hover === i ? 1 : 0;
      const br = still
        ? 0.5
        : 0.5 + 0.5 * Math.sin((t * Math.PI * 2) / per + ai);
      const sz =
        (lite ? 0.6 : 1) *
        (30 + 9 * am * br + 12 * hov + (st === "alert" ? 12 * br : 0)) *
        ap;
      ctx.globalAlpha = Math.min(1, 0.8 + 0.2 * am);
      ctx.drawImage(glowOf(c), px[i] - sz, py[i] - sz, sz * 2, sz * 2);
      if (!still) {
        for (let q = 0; q < 2; q++) {
          const ph = (t / per + q * 0.5 + ai * 0.13) % 1;
          ctx.strokeStyle = rgba(c, 1);
          ctx.globalAlpha = (1 - ph) * (st === "alert" ? 0.95 : 0.6) * ap;
          ctx.lineWidth = st === "alert" ? 1.6 : 1;
          ctx.beginPath();
          ctx.arc(
            px[i],
            py[i],
            5 + ph * 17 * ap * (st === "alert" ? 1.3 : 1),
            0,
            Math.PI * 2
          );
          ctx.stroke();
        }
      }
      ctx.strokeStyle = rgba(mix(WHITE, c, 0.55), 1);
      ctx.globalAlpha = 0.7 * ap;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(
        px[i],
        py[i],
        7.5 + br * (st === "alert" ? 2.4 : 1.2),
        0,
        Math.PI * 2
      );
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.globalAlpha = ap;
      ctx.beginPath();
      ctx.arc(px[i], py[i], 3.4, 0, Math.PI * 2);
      ctx.fill();
      labels.push({ i, x: px[i] + 14, y: py[i] - 11, a: ap });
    });
    hooks.onAgents?.(labels);

    // Callouts: a straight line from a dot on the core's edge to its pill.
    pills.forEach((pl, pi) => {
      if (pl.anchor < 0) return;
      const r = still ? 1 : clamp((now - clock.born - 1300 - pi * 420) / 900);
      if (r <= 0) return;
      const n = pl.anchor;
      const c = STATUS_HUE[pl.status];
      const rr = easeOut(r);
      const ex = px[n] + (pl.x - px[n]) * rr;
      ctx.strokeStyle = rgba(mix(WHITE, c, 0.6), 1);
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(px[n], py[n]);
      ctx.lineTo(ex, py[n]);
      ctx.stroke();
      ctx.globalAlpha = reveal[n];
      ctx.drawImage(glowOf(c), px[n] - 13, py[n] - 13, 26, 26);
      ctx.fillStyle = rgba(WHITE, 1);
      ctx.globalAlpha = 0.98 * reveal[n];
      ctx.beginPath();
      ctx.arc(px[n], py[n], 2.6, 0, Math.PI * 2);
      ctx.fill();
      if (rr > 0.98 && !still) {
        const ph = (t / (PERIOD[pl.status] * 0.6) + pi * 0.31) % 1;
        ctx.fillStyle = rgba(c, 1);
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(lerp(px[n], pl.x, ph), py[n], 1.7, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;

    // Hover: the pointer was recorded by the event and is read here, once
    // a frame, against the positions just drawn (PORT.md §8).
    if (live.moved) {
      live.moved = false;
      const best =
        live.pointer && ease > 0.9
          ? nearestReal(live.pointer.x, live.pointer.y)
          : -1;
      if (best !== live.hover) {
        live.hover = best;
        hooks.onHover(best, best >= 0 ? px[best] : 0, best >= 0 ? py[best] : 0);
      }
    }
  };

  function nearestReal(x: number, y: number) {
    let best = -1;
    let bd = 15 * 15;
    for (let i = 0; i < N; i++) {
      if (!nodes[i].real) continue;
      const d = (px[i] - x) ** 2 + (py[i] - y) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  const loop = (now: number) => {
    raf = 0;
    if (!running) return;
    if (now - last >= frameMs - 2) {
      const gap = now - last;
      last = now;
      const t0 = performance.now();
      frame(now);
      const took = performance.now() - t0;
      ema = ema ? ema * 0.9 + took * 0.1 : took;
      // A gap over 250 ms is a pause (hidden tab), not a slow frame.
      if (gap < 250) gapEma = gapEma ? gapEma * 0.9 + gap * 0.1 : gap;
      if (ema > 22 || gapEma > frameMs * 1.4) {
        if (!slowSince) slowSince = now;
        else if (now - slowSince > 600) degrade(now);
      } else slowSince = 0;
    }
    raf = requestAnimationFrame(loop);
  };

  frame(performance.now());
  return {
    /** Start or resume (not with reduced motion: one frame is the scene). */
    run() {
      if (still) return;
      running = true;
      if (!raf) raf = requestAnimationFrame(loop);
    },
    pause() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
    /** Reduced motion or paused: redraw one frame (hover, Presentation). */
    poke() {
      if (still || !running) frame(performance.now());
    },
    drift: () => drift,
    /** The current pixel ratio, light drawing and frame interval. */
    quality: () => ({ dpr, lite, frameMs }),
    /** The real node under a point, against the last frame (a tap). */
    hitAt(x: number, y: number) {
      return nearestReal(x, y);
    },
  };
}

/** A pill: a progress ring glowing in its status colour, a title and a line. */
function Pill({
  id,
  title,
  sub,
  progress,
  status,
  clickable,
  style,
  delay,
  onOpen,
}: {
  id: string;
  title: string;
  sub: string;
  progress: number;
  status: AgentStatus;
  clickable: boolean;
  style: CSSProperties;
  delay: number;
  onOpen: () => void;
}) {
  const C = 2 * Math.PI * 16;
  const [shown, setShown] = useState(reducedMotion());
  useEffect(() => {
    if (shown) return undefined;
    const t = window.setTimeout(() => setShown(true), delay);
    return () => window.clearTimeout(t);
  }, [delay, shown]);
  return (
    <button
      type="button"
      className={
        "ag-pill-res" + (shown ? " is-in" : "") + (clickable ? " is-go" : "")
      }
      data-ag-map-result={id}
      data-st={status}
      style={style}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
    >
      <span className="ag-pill-rg" aria-hidden="true">
        <svg viewBox="0 0 44 44">
          <circle className="ag-pill-tr" cx="22" cy="22" r="16" />
          <circle
            className="ag-pill-pg"
            cx="22"
            cy="22"
            r="16"
            strokeDasharray={C}
            strokeDashoffset={shown ? C * (1 - progress) : C}
          />
        </svg>
      </span>
      <span className="ag-pill-tx">
        <b>{title}</b>
        <span>{sub}</span>
      </span>
    </button>
  );
}

const LEGEND: [AgentStatus, string][] = [
  ["working", "Working"],
  ["ok", "All good"],
  ["waiting", "Needs your reply"],
  ["alert", "Needs you now"],
];

/**
 * The Map (owner's final reference, 05.11.26): the whole window, one
 * canvas drawn on requestAnimationFrame at 30 frames a second (24 on a
 * phone) with device pixels capped at 2; it stops while the tab is hidden
 * or the canvas is off screen, and with reduced motion it is one still
 * frame. Agents carry a small label (their tile, their name, a status dot);
 * the right column holds what needs you and what they did. Hover names a
 * node; a click opens an agent's card, its question in Chat, or an item.
 * Expand uses the Fullscreen API on the web and the whole window in the
 * app; Presentation (in full screen) swaps the owner's words for neutral
 * ones everywhere.
 */
export function AgentsMap({
  data,
  seed,
  status,
  onNewLayout,
  onReplaySetup,
  onOpenAgent,
  onOpenItem,
  onOpenThread,
  onOpenChat,
  paused = false,
}: {
  data: MapInput;
  seed: number;
  /** The real counts, shown small on the top bar. */
  status?: string | null;
  onNewLayout: () => void;
  /** Opens the first-visit setup again. */
  onReplaySetup?: () => void;
  onOpenAgent: (id: string) => void;
  onOpenItem: (id: string) => void;
  onOpenThread: (id: string) => void;
  /** An agent waiting on your answer: its question is in Chat. */
  onOpenChat?: () => void;
  /** Something covers the Map (the setup): it stops drawing. */
  paused?: boolean;
}) {
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const panel = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const labelEls = useRef<Map<number, HTMLDivElement | null>>(new Map());
  const portal = useV3PortalContainer();
  const [size, setSize] = useState({ w: 0, h: 0 });
  /** "window": the panel fills the app window; "screen": the Fullscreen API. */
  const [full, setFullMode] = useState<false | "window" | "screen">(false);
  const [presentation, setPresentation] = useState(false);
  const [legend, setLegend] = useState(true);
  const live = useRef<Live>({
    hover: -1,
    pointer: null,
    moved: false,
    presentation: false,
  });
  live.current.presentation = presentation;
  const loop = useRef<ReturnType<typeof startLoop> | null>(null);
  const resync = useRef<() => void>(() => undefined);

  // The legend says what the colours mean, then fades after 8 s.
  useEffect(() => {
    setLegend(true);
    const id = window.setTimeout(() => setLegend(false), LEGEND_MS);
    return () => window.clearTimeout(id);
  }, [seed]);

  // One observer, on the panel itself (PORT.md §8: never one per element).
  useEffect(() => {
    const el = panel.current;
    if (!el) return undefined;
    const measure = () => {
      const w = Math.round(el.clientWidth);
      const h = Math.round(el.clientHeight);
      setSize((s) => (s.w === w && s.h === h ? s : { w, h }));
    };
    measure();
    if (typeof ResizeObserver !== "function") return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [full]);

  // On the web the panel goes truly full screen; inside the desktop app (or
  // where the API is missing) it fills the app's window (owner, 05.11.26).
  const toggled = useRef(false);
  const setFull = (on: boolean) => {
    toggled.current = true;
    const el = panel.current;
    if (!on) {
      if (full === "screen" && document.fullscreenElement)
        void document.exitFullscreen?.().catch(() => undefined);
      setFullMode(false);
      return;
    }
    const app =
      document.documentElement.hasAttribute("data-desktop") ||
      document.documentElement.hasAttribute("data-desktop-shell");
    if (!app && el && typeof el.requestFullscreen === "function") {
      el.requestFullscreen()
        .then(() => setFullMode("screen"))
        .catch(() => setFullMode("window"));
      return;
    }
    setFullMode("window");
  };
  useEffect(() => {
    if (full !== "screen") return undefined;
    const left = () => {
      if (!document.fullscreenElement) setFullMode(false);
    };
    document.addEventListener("fullscreenchange", left);
    return () => document.removeEventListener("fullscreenchange", left);
  }, [full]);
  useEffect(() => {
    if (full !== "window") return undefined;
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setFullMode(false);
        return;
      }
      // Tab stays inside the panel while it covers the window.
      if (e.key !== "Tab" || !panel.current) return;
      const stops = Array.from(
        panel.current.querySelectorAll<HTMLElement>("button:not([disabled])")
      );
      if (!stops.length) return;
      const at = stops.indexOf(document.activeElement as HTMLElement);
      const next = e.shiftKey
        ? at <= 0
          ? stops.length - 1
          : at - 1
        : at === stops.length - 1
          ? 0
          : at + 1;
      e.preventDefault();
      stops[next].focus();
    };
    document.addEventListener("keydown", esc, true);
    return () => document.removeEventListener("keydown", esc, true);
  }, [full]);
  useEffect(() => {
    if (!full) setPresentation(false);
    if (!toggled.current) return;
    panel.current?.querySelector<HTMLElement>("[data-ag-map-full]")?.focus();
  }, [full]);
  // Presentation on or off: a showing tooltip goes, the rows redraw.
  useEffect(() => {
    if (tip.current) tip.current.style.opacity = "0";
    live.current.moved = true;
    loop.current?.poke();
  }, [presentation]);

  const scene = useMemo(
    () => (size.w && size.h ? buildMapScene(data, seed, size.w, size.h) : null),
    [data, seed, size.w, size.h]
  );
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  // One clock per layout: a new seed replays the entry, new data does not.
  const clock = useRef<{
    seed: number;
    born: number;
    mood: number;
    moodAt: number;
    dpr?: number;
    frameMs?: number;
    lite?: boolean;
  } | null>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!el || !scene) return undefined;
    const ctx = el.getContext?.("2d");
    if (!ctx) return undefined;
    // Device pixels at most 2; 1.5 on a phone and 1.25 in Safari, where the
    // canvas costs the most (owner's report, 05.11.26). Adaptive quality
    // lowers them further when frames run long.
    const safari =
      typeof navigator !== "undefined" &&
      /Safari\//.test(navigator.userAgent) &&
      !/Chrome|Chromium|CriOS|Edg\//.test(navigator.userAgent);
    const dpr = Math.min(
      safari ? 1.25 : scene.phone ? 1.5 : 2,
      window.devicePixelRatio || 1
    );
    el.width = Math.round(scene.width * dpr);
    el.height = Math.round(scene.height * dpr);
    if (!clock.current || clock.current.seed !== seed) {
      const now = performance.now();
      // A new layout replays the entry; what adaptive quality learned stays.
      clock.current = {
        seed,
        born: now,
        mood: 0,
        moodAt: now,
        dpr: clock.current?.dpr,
        frameMs: clock.current?.frameMs,
      };
    }
    live.current.hover = -1;
    if (tip.current) tip.current.style.opacity = "0";
    const run = startLoop(
      ctx,
      scene,
      dpr,
      live.current,
      {
        onHover: (index, x, y) => {
          const box = tip.current;
          if (!box) return;
          const node = index >= 0 ? scene.nodes[index] : null;
          const text = node ? nodeLabel(node, live.current.presentation) : null;
          el.style.cursor = node && node.kind !== "deco" ? "pointer" : "";
          if (!node || !text) {
            box.style.opacity = "0";
            return;
          }
          box.textContent = text;
          const small = document.createElement("small");
          if (node.kind === "agent") {
            const dot = document.createElement("i");
            const c = STATUS_HUE[node.status].join(",");
            dot.style.background = `rgb(${c})`;
            dot.style.boxShadow = `0 0 8px rgba(${c},.9)`;
            small.appendChild(dot);
            small.append(live.current.presentation ? "" : (node.sub ?? ""));
          } else {
            small.append(node.sub ?? "");
          }
          box.appendChild(small);
          box.style.transform = `translate(${x + 16}px, ${y - 40}px)`;
          box.style.opacity = "1";
        },
        onAgents: (list) => {
          for (const l of list) {
            const lab = labelEls.current.get(l.i);
            if (!lab) continue;
            lab.style.opacity = String(l.a);
            lab.style.transform = `translate(${l.x.toFixed(1)}px,${l.y.toFixed(1)}px)`;
          }
        },
      },
      clock.current
    );
    loop.current = run;
    let onScreen = true;
    const sync = () =>
      onScreen && !document.hidden && !pausedRef.current
        ? run.run()
        : run.pause();
    resync.current = sync;
    sync();
    document.addEventListener("visibilitychange", sync);
    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver === "function") {
      io = new IntersectionObserver(([entry]) => {
        onScreen = entry.isIntersecting;
        sync();
      });
      io.observe(el);
    }
    return () => {
      run.pause();
      io?.disconnect();
      document.removeEventListener("visibilitychange", sync);
      loop.current = null;
    };
    // The canvas element changes when the panel moves into the full window.
  }, [scene, seed, full]);

  // The setup opening or closing over the Map stops or restarts the loop.
  useEffect(() => {
    resync.current();
  }, [paused]);

  // The rect is cached and dropped on scroll and resize, never read inside
  // pointermove (PORT.md §8).
  const rect = useRef<DOMRect | null>(null);
  useEffect(() => {
    const drop = () => (rect.current = null);
    window.addEventListener("scroll", drop, { capture: true, passive: true });
    window.addEventListener("resize", drop);
    return () => {
      window.removeEventListener("scroll", drop, { capture: true });
      window.removeEventListener("resize", drop);
    };
  }, []);
  useEffect(() => {
    rect.current = null;
  }, [full, size]);

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!panel.current) return;
    rect.current ??= panel.current.getBoundingClientRect();
    live.current.pointer = {
      x: e.clientX - rect.current.left,
      y: e.clientY - rect.current.top,
    };
    live.current.moved = true;
    loop.current?.poke();
  };
  const onLeave = () => {
    live.current.pointer = null;
    live.current.moved = true;
    loop.current?.poke();
  };
  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const s = sceneRef.current;
    if (!s || !panel.current) return;
    rect.current ??= panel.current.getBoundingClientRect();
    // Hit-test the click itself: a tap on a phone sends no pointermove first.
    const i =
      loop.current?.hitAt(
        e.clientX - rect.current.left,
        e.clientY - rect.current.top
      ) ?? live.current.hover;
    if (i < 0) return;
    const node = s.nodes[i];
    if (node.kind === "agent") {
      if (node.status === "waiting" && onOpenChat) onOpenChat();
      else onOpenAgent(node.id);
    } else if (node.kind === "item") onOpenItem(node.id);
    else if (node.kind === "thread") onOpenThread(node.id);
  };
  const openPill = (go: { kind: "chat" | "agent" | "item"; id: string }) => {
    if (go.kind === "chat" && onOpenChat) onOpenChat();
    else if (go.kind === "item") onOpenItem(go.id);
    else onOpenAgent(go.id);
  };

  const agents = scene
    ? scene.agents.map((i) => ({ i, n: scene.nodes[i] }))
    : [];
  // Real task nodes, for the keyboard: the same open as a click.
  const taskNodes = scene
    ? scene.nodes.filter((n) => n.real && n.kind === "item" && n.label)
    : [];
  const body = (
    <div
      ref={panel}
      className={
        "ag-map-panel" +
        // In the window the panel is portalled out of the screen: it takes
        // the night's tokens with it.
        (full === "window"
          ? " is-full ag-night"
          : full === "screen"
            ? " is-screen"
            : "")
      }
      data-ag-map=""
      data-ag-map-seed={seed}
      data-ag-map-phone={scene?.phone ? "" : undefined}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      onClick={onClick}
    >
      <canvas ref={canvas} className="ag-map-canvas" aria-hidden="true" />
      <div className="ag-map-bar">
        {status ? (
          <span className="ag-map-status" data-ag-status="">
            {status}
          </span>
        ) : null}
        <span className="ag-map-sp" />
        {onReplaySetup && !full ? (
          <button
            type="button"
            className="ag-map-link"
            data-ag-replay-setup=""
            onClick={(e) => {
              e.stopPropagation();
              onReplaySetup();
            }}
          >
            Replay setup
          </button>
        ) : null}
        {full ? (
          <button
            type="button"
            className="ag-map-link"
            aria-pressed={presentation}
            data-ag-map-presentation=""
            onClick={(e) => {
              e.stopPropagation();
              setPresentation(!presentation);
            }}
          >
            <FiMonitor size={13} aria-hidden />
            Presentation
          </button>
        ) : null}
        <button
          type="button"
          className="ag-map-ib"
          title="New layout"
          aria-label="New layout"
          data-ag-map-shuffle=""
          onClick={(e) => {
            e.stopPropagation();
            onNewLayout();
          }}
        >
          <FiShuffle size={14} aria-hidden />
        </button>
        <button
          type="button"
          className="ag-map-ib"
          title={full ? "Exit full screen" : "Full screen"}
          aria-label={full ? "Exit full screen" : "Full screen"}
          data-ag-map-full=""
          onClick={(e) => {
            e.stopPropagation();
            setFull(!full);
          }}
        >
          {full ? (
            <FiMinimize2 size={14} aria-hidden />
          ) : (
            <FiMaximize2 size={14} aria-hidden />
          )}
        </button>
      </div>
      <div className="ag-alabs" aria-hidden="true">
        {agents.map(({ i, n }) => (
          <div
            key={n.id}
            ref={(el) => {
              labelEls.current.set(i, el);
            }}
            className="ag-alab"
            style={{ "--c": STATUS_HUE[n.status].join(",") } as CSSProperties}
          >
            <AgentIcon name={n.label ?? ""} size={18} />
            <span>{n.label}</span>
          </div>
        ))}
      </div>
      {scene?.pills.map((pl, i) => (
        <Pill
          key={pl.id}
          id={pl.go.kind === "item" ? pl.go.id : pl.id}
          title={presentation ? pl.neutral : pl.title}
          sub={presentation && pl.go.kind === "item" ? "" : pl.sub}
          progress={pl.progress}
          status={pl.status}
          clickable={pl.go.kind !== "item"}
          delay={1500 + i * 420}
          style={{ left: pl.x, top: pl.y, width: pl.w, height: pl.h }}
          onOpen={() => openPill(pl.go)}
        />
      ))}
      <div
        className={"ag-map-status-legend" + (legend ? "" : " is-off")}
        aria-label="What the colours mean"
      >
        {LEGEND.map(([k, label]) => (
          <span key={k}>
            <i
              aria-hidden="true"
              style={{ background: `rgb(${STATUS_HUE[k].join(",")})` }}
            />
            {label}
          </span>
        ))}
      </div>
      <div ref={tip} className="ag-map-tip" aria-hidden="true" />
      {agents.length || taskNodes.length ? (
        <ul className="ag-map-agents" aria-label="Agents and tasks on the map">
          {agents.map(({ n }) => (
            <li key={n.id}>
              <button
                type="button"
                data-ag-map-agent={n.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenAgent(n.id);
                }}
              >
                {`Open ${n.label}`}
              </button>
            </li>
          ))}
          {taskNodes.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                data-ag-map-item={n.id}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenItem(n.id);
                }}
              >
                {`Open task: ${nodeLabel(n, presentation)}`}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
  if (full !== "window" || !portal) return body;
  // The panel leaves its place in the page for the window; a placeholder of
  // the same height keeps the page from jumping under it.
  return (
    <>
      <div className="ag-map-panel is-placeholder" aria-hidden="true" />
      {createPortal(body, portal)}
    </>
  );
}
