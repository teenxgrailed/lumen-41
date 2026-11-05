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
import { shortWhen } from "./AgParts";
import {
  BLUE,
  type MapInput,
  type MapScene,
  type Rgb,
  STATUS_HUE,
  WHITE,
  buildMapScene,
  mix,
  nodeLabel,
} from "./map-scene";

/** One breath for everything alive in the product (PORT.md §6). */
const BREATH_S = 5.2;
/** The scene draws at 30 frames a second: the motion is slow, the budget is not. */
const FRAME_MS = 1000 / 30;
/** The scene draws itself in over this long on arrival. */
const ENTRY_MS = 1800;
/** A new mood every 13 s, crossfading over about 2.5 s. */
const MOOD_MS = 13_000;
const MOOD_TAU_S = 0.9;
/**
 * Three moods as weights: pulses, the light wave's speed, the glow, how
 * often a small "constellation forms". The scene only leans, it never jumps.
 */
const MOODS: readonly [number, number, number, number][] = [
  [1, 1, 1, 1],
  [1.9, 1.7, 1.1, 0.8],
  [0.7, 0.75, 1.35, 1.9],
];
const NIGHT = "#050507";
const MAX_PULSES = 24;
/** Lines are batched into this many brightness steps. */
const ALPHA_STEPS = 6;

const rgba = (c: Rgb, a: number) =>
  `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
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

/** The cold glow, drawn once and stamped with drawImage. */
let glowSprite: HTMLCanvasElement | null = null;
function glow() {
  if (glowSprite) return glowSprite;
  const el = document.createElement("canvas");
  el.width = el.height = 128;
  const g = el.getContext("2d");
  if (g) {
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(170,215,255,.95)");
    grad.addColorStop(0.22, "rgba(90,169,255,.38)");
    grad.addColorStop(1, "rgba(90,169,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
  glowSprite = el;
  return el;
}

function reducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export interface Live {
  hover: number;
  pointer: { x: number; y: number } | null;
  moved: boolean;
  presentation: boolean;
}

/**
 * The drawing loop for one scene (the owner's "Constellation", 05.11.26).
 * Returns its controls. Batched: the source threads and their particles in
 * one stroke and one fill, the lines in a few brightness steps, the lit and
 * hovered ones on top. Colour is white and one blue; an agent's status
 * colours only its own marks (dot, rings, pulses, nearest lines).
 */
export function startLoop(
  ctx: CanvasRenderingContext2D,
  scene: MapScene,
  dpr: number,
  live: Live,
  hooks: {
    onHover: (index: number, x: number, y: number) => void;
  },
  /**
   * Carried across rebuilds of the same layout (new data, full screen): the
   * entry does not replay and the mood does not reset. Mutated in place.
   */
  clock: { born: number; mood: number; moodAt: number } = {
    born: performance.now(),
    mood: 0,
    moodAt: performance.now(),
  }
) {
  const { nodes, edges, streams, adj, core, results } = scene;
  const W = scene.width;
  const H = scene.height;
  const N = nodes.length;
  const still = reducedMotion();
  // A phone rasterises the canvas on a slow CPU (perf, iPhone 13 at 4x):
  // fewer frames, no additive blending, smaller glows.
  const lite = scene.phone;
  const frameMs = lite ? 1000 / 24 : FRAME_MS;
  const px = new Float32Array(N);
  const py = new Float32Array(N);
  const lit = new Float32Array(N);
  const hit = new Float32Array(N);
  const reveal = new Float32Array(N);
  const owner = new Int32Array(N).fill(-1);
  // Each node takes the status of the agent it hangs from (for its lines).
  scene.agents.forEach((a) => {
    owner[a] = a;
    for (const e of adj[a]) {
      const E = edges[e];
      const other = E.a === a ? E.b : E.a;
      if (owner[other] < 0) owner[other] = a;
    }
  });
  const hueOf = (i: number) =>
    owner[i] >= 0 && nodes[owner[i]].status !== "ok"
      ? STATUS_HUE[nodes[owner[i]].status]
      : null;

  const mood = { cur: [...MOODS[clock.mood % MOODS.length]] };
  const rings: { t0: number; n: number }[] = [];
  const pulses: {
    cur: number;
    prev: number;
    e: number;
    u: number;
    v: number;
    hops: number;
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

  const frame = (now: number) => {
    const t = still ? 3.2 : (now - clock.born) / 1000;
    const dt = Math.min(0.05, Math.max(0, t - lastT)) || 0.016;
    lastT = t;
    const age = still ? 1 : clamp((now - clock.born) / ENTRY_MS);
    const ease = easeOut(age);

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

    // A slow drift, and parallax from the pointer by each node's depth.
    const p = live.pointer;
    const k = 1 - Math.exp(-dt / 0.4);
    mouse.px += ((p ? p.x / W - 0.5 : 0) - mouse.px) * k;
    mouse.py += ((p ? p.y / H - 0.5 : 0) - mouse.py) * k;
    const OX = still ? 0 : Math.sin(t * 0.045) * 10 - mouse.px * 26;
    const OY = still ? 0 : Math.cos(t * 0.038) * 7 - mouse.py * 18;
    drift = { dx: OX, dy: OY };

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = NIGHT;
    ctx.fillRect(0, 0, W, H);
    // The single blue glow behind the constellation.
    const gx = core.x + OX * 0.5;
    const gy = core.y + OY * 0.5;
    const gr = Math.max(core.rx * 2.2, core.ry * 1.3);
    const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, gr);
    g.addColorStop(0, rgba(BLUE, (0.24 + 0.07 * breath) * mG * ease));
    g.addColorStop(0.45, rgba(BLUE, 0.05 * mG * ease));
    g.addColorStop(1, "rgba(90,169,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = lite ? "source-over" : "lighter";

    // Positions: breathe about the core, parallax by depth; a slow wave of
    // light crosses the cluster and rings spread from the agents.
    const front = -1.6 + ((t * 0.085 * mW) % 1) * 3.4;
    const ca = Math.cos(-0.35);
    const sa = Math.sin(-0.35);
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
      const s = 1 + 0.02 * Math.sin((t * Math.PI * 2) / BREATH_S + n.d * 2);
      const x = core.x + (n.x - core.x) * s;
      const y = core.y + (n.y - core.y) * s;
      px[i] = x + OX * n.z;
      py[i] = y + OY * n.z;
      const u = ((n.x - core.x) * ca + (n.y - core.y) * sa) / (core.rx * 1.3);
      let l = still ? 0 : Math.exp(-(((u - front) / 0.16) ** 2)) * 0.85;
      for (const r of rings) {
        const rr = ((now - r.t0) / 1000) * 190;
        const dd = Math.hypot(x - nodes[r.n].x, y - nodes[r.n].y);
        l = Math.max(
          l,
          Math.exp(-(((dd - rr) / 26) ** 2)) * (1 - (now - r.t0) / 2800) * 0.9
        );
      }
      hit[i] *= 0.94;
      lit[i] = Math.max(l, hit[i]);
      reveal[i] =
        n.kind === "agent"
          ? clamp(age * 2.4 - 0.35)
          : Math.min(1, clamp(age * 1.5 - n.d * 0.6) * 2.5);
    }

    // Source threads: white, low alpha, drawn in; particles white to blue.
    const grow = clamp(age * 1.35);
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = rgba(WHITE, 1);
    ctx.globalAlpha = 0.09 * (1 + 0.15 * mP);
    ctx.beginPath();
    for (const st of streams) {
      const sw = still ? 0 : Math.sin(t * 0.6 + st.sway) * 9;
      const x0 = st.x0 + OX * 0.2;
      const y0 = st.y0 + OY * 0.2;
      const x1 = px[st.node];
      const y1 = py[st.node];
      ctx.moveTo(x0, y0);
      if (grow >= 1) {
        ctx.bezierCurveTo(
          st.c1x,
          st.c1y + sw,
          st.c2x + sw * 0.4,
          st.c2y - sw,
          x1,
          y1
        );
      } else {
        const steps = 24;
        for (let q = 1; q <= Math.floor(steps * grow); q++) {
          const [bx, by] = bez(
            x0,
            y0,
            st.c1x,
            st.c1y + sw,
            st.c2x + sw * 0.4,
            st.c2y - sw,
            x1,
            y1,
            q / steps
          );
          ctx.lineTo(bx, by);
        }
      }
    }
    ctx.stroke();
    if (!still && age > 0.3) {
      ctx.fillStyle = rgba(mix(WHITE, BLUE, 0.5), 1);
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      for (const st of streams) {
        const sw = Math.sin(t * 0.6 + st.sway) * 9;
        for (let q = 0; q < 2; q++) {
          const ph = (t * st.speed * mP + st.offset + q * 0.5) % 1;
          if (ph > grow) continue;
          const [bx, by] = bez(
            st.x0 + OX * 0.2,
            st.y0 + OY * 0.2,
            st.c1x,
            st.c1y + sw,
            st.c2x + sw * 0.4,
            st.c2y - sw,
            px[st.node],
            py[st.node],
            ph
          );
          ctx.moveTo(bx + 1.1, by);
          ctx.arc(bx, by, 1.1, 0, Math.PI * 2);
        }
      }
      ctx.fill();
    }

    // Lines: faint white, shimmering, in a few brightness steps; brighter
    // where the wave passes; the agent's status colour near it.
    const hset = live.hover >= 0 ? new Set(adj[live.hover]) : null;
    const buckets: number[][] = Array.from({ length: ALPHA_STEPS }, () => []);
    const extra: number[] = [];
    for (let e = 0; e < edges.length; e++) {
      const E = edges[e];
      const rv = Math.min(reveal[E.a], reveal[E.b]);
      if (rv <= 0) continue;
      if (
        (hset && hset.has(e)) ||
        Math.max(lit[E.a], lit[E.b]) > 0.08 ||
        hueOf(E.a) ||
        hueOf(E.b)
      ) {
        extra.push(e);
        continue;
      }
      const sh = still ? 0 : 0.035 * Math.sin(t * E.rate + E.phase);
      const a = (0.085 + sh + 0.03 * breath) * rv;
      buckets[
        clamp(Math.floor((a / 0.16) * ALPHA_STEPS), 0, ALPHA_STEPS - 1)
      ].push(e);
    }
    ctx.strokeStyle = rgba(WHITE, 1);
    ctx.lineWidth = 0.5;
    buckets.forEach((list, b) => {
      if (!list.length) return;
      ctx.globalAlpha = ((b + 0.5) / ALPHA_STEPS) * 0.16;
      ctx.beginPath();
      for (const e of list) {
        ctx.moveTo(px[edges[e].a], py[edges[e].a]);
        ctx.lineTo(px[edges[e].b], py[edges[e].b]);
      }
      ctx.stroke();
    });
    for (const e of extra) {
      const E = edges[e];
      const hot = hset?.has(e);
      const l = Math.max(lit[E.a], lit[E.b]);
      const status = hueOf(E.a) ?? hueOf(E.b);
      const base = status ?? WHITE;
      ctx.strokeStyle = rgba(
        hot ? (status ?? BLUE) : mix(base, BLUE, l * 0.8),
        1
      );
      ctx.globalAlpha = hot
        ? 0.85
        : (0.085 + (status ? 0.12 : 0) + 0.55 * l) *
          Math.min(reveal[E.a], reveal[E.b]);
      ctx.lineWidth = hot ? 1.2 : 0.5 + 0.7 * l;
      ctx.beginPath();
      ctx.moveTo(px[E.a], py[E.a]);
      ctx.lineTo(px[E.b], py[E.b]);
      ctx.stroke();
    }

    // Pulses: an agent's work hopping along the lines, in its status colour.
    if (
      !still &&
      pulses.length < MAX_PULSES &&
      scene.agents.length &&
      age > 0.8 &&
      Math.random() < dt * 2.4 * mP
    ) {
      pulses.push({
        cur: scene.agents[Math.floor(Math.random() * scene.agents.length)],
        prev: -1,
        e: -1,
        u: 1,
        v: 1.6 + Math.random(),
        hops: 0,
      });
    }
    for (let i = pulses.length - 1; i >= 0; i--) {
      const pl = pulses[i];
      if (pl.u >= 1) {
        if (pl.e >= 0) {
          const E = edges[pl.e];
          pl.prev = pl.cur;
          pl.cur = E.a === pl.cur ? E.b : E.a;
          hit[pl.cur] = 1;
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
      const x = px[a] + (px[b] - px[a]) * u;
      const y = py[a] + (py[b] - py[a]) * u;
      const back = Math.max(0, u - 0.35);
      const hue = hueOf(a) ?? mix(WHITE, BLUE, 0.4);
      ctx.strokeStyle = rgba(hue, 1);
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(
        px[a] + (px[b] - px[a]) * back,
        py[a] + (py[b] - py[a]) * back
      );
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = rgba(hue, 1);
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // "Constellation forms": a few neighbours briefly link brighter.
    if (!still && now > nextForm && age > 0.9) {
      const mids = nodes
        .map((n, i) => (n.kind !== "agent" && n.d < 0.85 ? i : -1))
        .filter((i) => i >= 0);
      const c = mids[Math.floor(Math.random() * mids.length)];
      if (c !== undefined) {
        const R = lite ? 70 : 125;
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
      const gw = Math.min(1, u * 3.2);
      ctx.strokeStyle = rgba(mix(WHITE, BLUE, 0.45), 1);
      ctx.globalAlpha = 0.8 * a;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const [p1, q1] of f.links) {
        ctx.moveTo(px[p1], py[p1]);
        ctx.lineTo(
          px[p1] + (px[q1] - px[p1]) * gw,
          py[p1] + (py[q1] - py[p1]) * gw
        );
      }
      ctx.stroke();
      if (!lite)
        for (const n of f.set) {
          ctx.globalAlpha = a;
          ctx.drawImage(
            glow(),
            px[n] - 11 * a - 2,
            py[n] - 11 * a - 2,
            22 * a + 4,
            22 * a + 4
          );
        }
    }

    // Nodes: white, lit toward blue; decoration dimmer than real ones.
    ctx.fillStyle = rgba(WHITE, 1);
    for (let i = 0; i < N; i++) {
      const n = nodes[i];
      if (reveal[i] <= 0 || n.kind === "agent") continue;
      const tw = still ? 0 : 0.12 * Math.sin(t * 1.3 + n.phase);
      ctx.globalAlpha = clamp(
        ((n.real ? 0.55 : 0.36) + tw + 0.6 * lit[i]) * reveal[i]
      );
      ctx.fillStyle =
        lit[i] > 0.1 ? rgba(mix(WHITE, BLUE, lit[i] * 0.7), 1) : rgba(WHITE, 1);
      ctx.beginPath();
      ctx.arc(
        px[i],
        py[i],
        n.r * (1 + 0.6 * lit[i]) * (0.5 + 0.5 * reveal[i]),
        0,
        Math.PI * 2
      );
      ctx.fill();
      if (!lite && lit[i] > 0.35) {
        const s = 14 * lit[i];
        ctx.globalAlpha = lit[i] * 0.5;
        ctx.drawImage(glow(), px[i] - s, py[i] - s, s * 2, s * 2);
      }
    }

    // Agents: a glow, two breathing rings and a dot in the status colour.
    ctx.font = "500 12px system-ui, sans-serif";
    ctx.textBaseline = "middle";
    for (const i of scene.agents) {
      const n = nodes[i];
      const ap = reveal[i];
      if (ap <= 0) continue;
      const hue = STATUS_HUE[n.status];
      const hot = live.hover === i ? 1 : 0;
      const sz = (lite ? 0.6 : 1) * (46 + 10 * breath + 14 * hot) * ap;
      ctx.globalAlpha = 1;
      ctx.drawImage(glow(), px[i] - sz, py[i] - sz, sz * 2, sz * 2);
      ctx.lineWidth = 1;
      for (let q = 0; q < 2; q++) {
        const ph = (t / BREATH_S + q * 0.5) % 1;
        ctx.strokeStyle = rgba(hue, 1);
        ctx.globalAlpha =
          (1 - ph) * 0.55 * ap * (n.seen || n.status !== "ok" ? 1 : 0.5);
        ctx.beginPath();
        ctx.arc(px[i], py[i], 5 + ph * 15 * ap, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.strokeStyle = rgba(WHITE, 1);
      ctx.globalAlpha = 0.45 * ap;
      ctx.beginPath();
      ctx.arc(px[i], py[i], 7.5 + breath * 1.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = rgba(n.status === "ok" ? [255, 255, 255] : hue, 1);
      ctx.globalAlpha = ap;
      ctx.beginPath();
      ctx.arc(px[i], py[i], 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = rgba(WHITE, 1);
      ctx.globalAlpha = 0.6 * ap;
      ctx.fillText(n.label ?? "", px[i] + 14, py[i] + 1);
    }

    // Leader lines from an agent to its result pill.
    results.forEach((res, ri) => {
      const r = still ? 1 : clamp((now - clock.born - 1400 - ri * 420) / 900);
      if (r <= 0) return;
      const n = res.node;
      const ex = scene.phone ? res.x + 34 : res.x;
      const ey = scene.phone ? res.y : res.y + res.h / 2;
      const dx = ex - px[n];
      const dy = ey - py[n];
      const c1x = scene.phone ? px[n] : px[n] + dx * 0.55;
      const c1y = scene.phone ? py[n] + dy * 0.5 : py[n];
      const c2x = scene.phone ? ex : ex - dx * 0.3;
      const c2y = scene.phone ? ey - dy * 0.35 : ey;
      const rr = easeOut(r);
      ctx.strokeStyle = rgba(mix(WHITE, BLUE, 0.35), 1);
      ctx.globalAlpha = 0.38;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(px[n], py[n]);
      for (let q = 1; q <= 30 * rr; q++) {
        const [bx, by] = bez(px[n], py[n], c1x, c1y, c2x, c2y, ex, ey, q / 30);
        ctx.lineTo(bx, by);
      }
      ctx.stroke();
      if (rr > 0.98) {
        ctx.globalAlpha = 1;
        ctx.drawImage(glow(), ex - 9, ey - 9, 18, 18);
        ctx.fillStyle = rgba(WHITE, 1);
        ctx.globalAlpha = 0.95;
        ctx.beginPath();
        ctx.arc(ex, ey, 2, 0, Math.PI * 2);
        ctx.fill();
        if (!still) {
          const ph = (t * 0.22 + ri * 0.31) % 1;
          const [bx, by] = bez(px[n], py[n], c1x, c1y, c2x, c2y, ex, ey, ph);
          ctx.fillStyle = rgba(mix(WHITE, BLUE, ph), 1);
          ctx.globalAlpha = 0.9;
          ctx.beginPath();
          ctx.arc(bx, by, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
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
        hooks.onHover(best, live.pointer?.x ?? 0, live.pointer?.y ?? 0);
      } else if (best >= 0 && live.pointer) {
        hooks.onHover(best, live.pointer.x, live.pointer.y);
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
      last = now;
      frame(now);
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
    /** Reduced motion: hover redraws one frame on demand. */
    poke() {
      if (still || !running) frame(performance.now());
    },
    drift: () => drift,
    /** The real node under a point, against the last frame (a tap). */
    hitAt(x: number, y: number) {
      return nearestReal(x, y);
    },
  };
}

/** A result pill: a glowing progress ring, the title, who and when. */
function Pill({
  title,
  sub,
  progress,
  status,
  style,
  delay,
  onOpen,
  id,
}: {
  title: string;
  sub: string;
  progress: number;
  status: keyof typeof STATUS_HUE;
  style: CSSProperties;
  delay: number;
  onOpen: () => void;
  id: string;
}) {
  const C = 2 * Math.PI * 16;
  const [shown, setShown] = useState(reducedMotion());
  useEffect(() => {
    if (shown) return undefined;
    const t = window.setTimeout(() => setShown(true), delay);
    return () => window.clearTimeout(t);
  }, [delay, shown]);
  const hue = STATUS_HUE[status];
  return (
    <button
      type="button"
      className={"ag-pill-res" + (shown ? " is-in" : "")}
      data-ag-map-result={id}
      style={
        { ...style, "--ring": `${hue[0]},${hue[1]},${hue[2]}` } as CSSProperties
      }
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

/**
 * The Map: the night panel with the live constellation. One canvas, drawn on
 * requestAnimationFrame at 30 frames a second with device pixels capped at 2;
 * it stops while the tab is hidden or the panel is off screen, and with
 * reduced motion it is one still frame. Hover names a node and lights its
 * lines; a click opens an agent's card or an item inside Agents. Full screen
 * fills the window (Esc leaves it) and offers Presentation, which swaps the
 * owner's words for neutral ones.
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
}: {
  data: MapInput;
  seed: number;
  /** The hero pill's real counts, shown on the panel's bar. */
  status?: string | null;
  onNewLayout: () => void;
  /** Opens the first-visit setup again. */
  onReplaySetup?: () => void;
  onOpenAgent: (id: string) => void;
  onOpenItem: (id: string) => void;
  onOpenThread: (id: string) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const portal = useV3PortalContainer();
  const [size, setSize] = useState({ w: 0, h: 0 });
  /** "window": the panel fills the app window; "screen": the Fullscreen API. */
  const [full, setFullMode] = useState<false | "window" | "screen">(false);
  const [presentation, setPresentation] = useState(false);
  const live = useRef<Live>({
    hover: -1,
    pointer: null,
    moved: false,
    presentation: false,
  });
  live.current.presentation = presentation;
  const loop = useRef<ReturnType<typeof startLoop> | null>(null);

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
  // Esc or the system leaving full screen ends the mode.
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
  const toggled = useRef(false);
  useEffect(() => {
    if (!full) setPresentation(false);
    // The panel moved (into the window, or back): focus stays on its button.
    if (!toggled.current) return;
    panel.current?.querySelector<HTMLElement>("[data-ag-map-full]")?.focus();
  }, [full]);
  // Presentation on: a tooltip already showing an owner's title goes.
  useEffect(() => {
    if (tip.current) tip.current.style.opacity = "0";
    live.current.moved = true;
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
  } | null>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!el || !scene) return undefined;
    const ctx = el.getContext?.("2d");
    if (!ctx) return undefined;
    // Device pixels at most 2, and 1.5 on a phone (see `lite` in startLoop).
    const dpr = Math.min(scene.phone ? 1.5 : 2, window.devicePixelRatio || 1);
    el.width = Math.round(scene.width * dpr);
    el.height = Math.round(scene.height * dpr);
    if (!clock.current || clock.current.seed !== seed) {
      const now = performance.now();
      clock.current = { seed, born: now, mood: 0, moodAt: now };
    }
    live.current.hover = -1;
    if (tip.current) tip.current.style.opacity = "0";
    const run = startLoop(
      ctx,
      scene,
      dpr,
      live.current,
      {
        onHover: (index, px, py) => {
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
          if (node.kind === "agent") {
            const more = document.createElement("small");
            more.textContent = ` · ${scene.adj[index].length} links · open`;
            box.appendChild(more);
          }
          box.style.transform = `translate(${px + 14}px, ${py - 30}px)`;
          box.style.opacity = "1";
        },
      },
      clock.current
    );
    loop.current = run;
    let onScreen = true;
    const sync = () => (onScreen && !document.hidden ? run.run() : run.pause());
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
    if (node.kind === "agent") onOpenAgent(node.id);
    else if (node.kind === "item") onOpenItem(node.id);
    else if (node.kind === "thread") onOpenThread(node.id);
  };

  const agents = scene ? scene.agents.map((i) => scene.nodes[i]) : [];
  const body = (
    <div
      ref={panel}
      className={
        "ag-map-panel" +
        (full === "window" ? " is-full" : full === "screen" ? " is-screen" : "")
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
      {scene ? (
        <div className="ag-map-srcs" aria-label="Sources">
          {scene.sources.map((s, i) => (
            <span
              key={s.id}
              className="ag-map-src"
              style={{
                left: s.x,
                top: s.y,
                animationDelay: `${200 + i * 60}ms`,
              }}
            >
              {scene.phone ? s.short : s.label}
            </span>
          ))}
        </div>
      ) : null}
      {scene?.results.map((r, i) => (
        <Pill
          key={r.id}
          id={r.id}
          title={presentation ? "Finished task" : r.title}
          sub={[r.by, shortWhen(r.at)].filter(Boolean).join(" · ")}
          progress={r.progress}
          status={r.status}
          delay={1500 + i * 420}
          style={{ left: r.x, top: r.y, width: r.w, height: r.h }}
          onOpen={() => onOpenItem(r.id)}
        />
      ))}
      <div className="ag-map-status-legend" aria-label="What the colours mean">
        {(
          [
            ["working", "Working"],
            ["ok", "All good"],
            ["waiting", "Needs your reply"],
            ["alert", "Needs you now"],
          ] as const
        ).map(([k, label]) => (
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
      {agents.length ? (
        <ul className="ag-map-agents" aria-label="Agents on the map">
          {agents.map((n) => (
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
