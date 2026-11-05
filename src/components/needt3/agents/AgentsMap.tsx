"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { createPortal } from "react-dom";
import { FiMaximize2, FiMinimize2, FiMonitor, FiShuffle } from "react-icons/fi";

import { useV3PortalContainer } from "../ctx/PortalScope";
import { shortWhen } from "./AgParts";
import {
  type MapInput,
  type MapScene,
  type MapStream,
  type Rgb,
  WHITE,
  buildMapScene,
  mix,
  nodeLabel,
} from "./map-scene";

/** One breath for everything alive in the product (PORT.md §6). */
const BREATH_S = 5.2;
/** The scene draws at 30 frames a second: the motion is slow, the budget is not. */
const FRAME_MS = 1000 / 30;
/** Threads draw themselves in over this long on arrival. */
const ENTRY_MS = 1800;
/** A new mood every 13 s, crossfading over about 2.5 s. */
const MOOD_MS = 13_000;
const MOOD_TAU_S = 0.8;
export const MOODS = ["Flow", "Surge", "Tide", "Heartbeat"] as const;
const NIGHT = "#06060a";
const MAX_PULSES = 24;

const rgba = (c: Rgb, a: number) =>
  `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const keyOf = (c: Rgb) => `${c[0] | 0},${c[1] | 0},${c[2] | 0}`;

function bez(
  s: MapStream,
  c1y: number,
  c2x: number,
  c2y: number,
  ex: number,
  ey: number,
  t: number
) {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [
    a * s.x0 + b * s.c1x + c * c2x + d * ex,
    a * s.y0 + b * c1y + c * c2y + d * ey,
  ] as const;
}

/** A soft round glow in one colour, drawn once and stamped with drawImage. */
const sprites = new Map<string, HTMLCanvasElement>();
function glowSprite(c: Rgb) {
  const key = keyOf(c);
  const hit = sprites.get(key);
  if (hit) return hit;
  const el = document.createElement("canvas");
  el.width = el.height = 64;
  const g = el.getContext("2d");
  if (g) {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, rgba(c, 1));
    grad.addColorStop(1, rgba(c, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  sprites.set(key, el);
  return el;
}

function reducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

interface Live {
  hover: number;
  pointer: { x: number; y: number } | null;
  moved: boolean;
  presentation: boolean;
}

/**
 * The drawing loop for one scene. Returns a stop function. Batched by colour:
 * one stroke per source for the threads, one fill per source for their
 * particles, one stroke per colour for the lines, so a frame is a few dozen
 * draw calls however many elements the scene holds.
 */
export function startLoop(
  ctx: CanvasRenderingContext2D,
  scene: MapScene,
  dpr: number,
  live: Live,
  hooks: {
    onHover: (index: number, x: number, y: number) => void;
    onMood: (mood: number) => void;
  }
) {
  const { nodes, edges, streams, exits, adj, core, results } = scene;
  const W = scene.width;
  const H = scene.height;
  const still = reducedMotion();
  const N = nodes.length;
  const bx = Float32Array.from(nodes, (n) => n.x);
  const by = Float32Array.from(nodes, (n) => n.y);
  const x = Float32Array.from(bx);
  const y = Float32Array.from(by);
  const lit = new Float32Array(N);
  const tide = new Float32Array(N);
  const flash = new Float64Array(N);
  const hueStr = nodes.map((n) => rgba(n.hue, 1));
  const dotStr = nodes.map((n) =>
    rgba(mix(n.hue, WHITE, n.kind === "agent" ? 0.25 : 0.5), 1)
  );

  // Lines grouped once by colour: one stroke per group per frame.
  const groups = new Map<string, { color: string; edges: number[] }>();
  edges.forEach(([a], e) => {
    const c = mix(WHITE, nodes[a].hue, 0.35);
    const k = keyOf(c);
    const g = groups.get(k) ?? { color: rgba(c, 1), edges: [] };
    g.edges.push(e);
    groups.set(k, g);
  });
  // Threads grouped by source.
  const bySource = scene.sources.map((source, s) => {
    const list = streams.filter((st) => st.source === s);
    const alpha =
      list.reduce((sum, st) => sum + st.alpha, 0) / (list.length || 1);
    const width =
      list.reduce((sum, st) => sum + st.width, 0) / (list.length || 1);
    return { hue: source.hue, list, alpha, width, dot: rgba(source.hue, 1) };
  });

  const born = performance.now();
  const w = [1, 0, 0, 0];
  let mood = 0;
  let moodAt = born;
  const waves: number[] = [];
  const pulses: { path: number[]; t: number; color: Rgb }[] = [];
  const mouse = { px: 0, py: 0 };
  let raf = 0;
  let last = 0;
  let lastT = 0;
  let running = false;
  let drift = { dx: 0, dy: 0 };

  const frame = (now: number) => {
    const t = still ? 0 : (now - born) / 1000;
    const dt = Math.min(0.1, Math.max(0, t - lastT));
    lastT = t;
    const age = still ? 1 : Math.min(1, (now - born) / ENTRY_MS);
    const ease = 1 - Math.pow(1 - age, 3);

    if (!still && now - moodAt > MOOD_MS) {
      mood = (mood + 1 + Math.floor(Math.random() * 3)) % 4;
      moodAt = now;
      hooks.onMood(mood);
      if (mood === 3) waves.push(now);
    }
    const blend = 1 - Math.exp(-dt / MOOD_TAU_S);
    for (let k = 0; k < 4; k++) w[k] += ((k === mood ? 1 : 0) - w[k]) * blend;
    const [, wS, wT, wH] = w;
    const breath = 0.5 + 0.5 * Math.sin((t * Math.PI * 2) / BREATH_S);
    const speed = 1 + 1.6 * wS;

    // A slow drift of the whole scene, and a little parallax from the pointer.
    const p = live.pointer;
    const k = 1 - Math.exp(-dt / 0.4);
    mouse.px += ((p ? p.x / W - 0.5 : 0) - mouse.px) * k;
    mouse.py += ((p ? p.y / H - 0.5 : 0) - mouse.py) * k;
    const dx = still ? 0 : Math.sin(t * 0.07) * 8 - mouse.px * 14;
    const dy = still ? 0 : Math.cos(t * 0.05) * 6 - mouse.py * 10;
    drift = { dx, dy };

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;
    ctx.fillStyle = NIGHT;
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(
      core.x + dx,
      core.y + dy,
      0,
      core.x + dx,
      core.y + dy,
      Math.max(core.rx, core.ry) * 2.2
    );
    glow.addColorStop(
      0,
      `rgba(110,100,220,${0.1 + 0.05 * breath + 0.08 * wH})`
    );
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    ctx.translate(dx, dy);
    ctx.globalCompositeOperation = "lighter";

    // The cluster breathes in place; the heartbeat and the tide light it.
    const tideX = core.x - core.rx * 1.6 + ((t * 0.12) % 1) * core.rx * 3.2;
    const tideHue =
      scene.sources[Math.floor(t / 8) % scene.sources.length]?.hue ?? WHITE;
    while (waves.length && now - waves[0] > 2600) waves.shift();
    if (!still && wH > 0.5 && Math.random() < 0.36 * dt) waves.push(now);
    for (let i = 0; i < N; i++) {
      const n = nodes[i];
      const s = 1 + 0.025 * Math.sin((t * Math.PI * 2) / BREATH_S + n.d * 2);
      x[i] = core.x + (bx[i] - core.x) * s;
      y[i] = core.y + (by[i] - core.y) * s;
      let v = 0;
      for (const w0 of waves) {
        const r = ((now - w0) / 2600) * 1.4;
        v = Math.max(v, Math.exp(-((n.d - r) ** 2) / 0.006));
      }
      lit[i] = v;
      tide[i] = wT > 0.02 ? wT * Math.exp(-((x[i] - tideX) ** 2) / 3200) : 0;
    }

    // Threads in: one stroke per source; drawn in over the entry.
    for (const group of bySource) {
      ctx.strokeStyle = rgba(mix(WHITE, group.hue, 0.45 + 0.3 * wT), 1);
      ctx.globalAlpha = Math.min(1, group.alpha * (1 + 0.5 * wS));
      ctx.lineWidth = group.width;
      ctx.beginPath();
      for (const s of group.list) {
        const sw = still ? 0 : Math.sin(t * 0.6 + s.sway) * 12;
        const c1y = s.c1y + sw;
        const c2x = s.c2x + sw * 0.5;
        const c2y = s.c2y - sw;
        const ex = x[s.node];
        const ey = y[s.node];
        if (ease >= 1) {
          ctx.moveTo(s.x0, s.y0);
          ctx.bezierCurveTo(s.c1x, c1y, c2x, c2y, ex, ey);
        } else {
          const steps = 24;
          const end = Math.floor(steps * ease);
          ctx.moveTo(s.x0, s.y0);
          for (let i = 1; i <= end; i++) {
            const [px, py] = bez(s, c1y, c2x, c2y, ex, ey, i / steps);
            ctx.lineTo(px, py);
          }
        }
      }
      ctx.stroke();
      if (still) continue;
      // Particles flowing in, one fill per source.
      const per = 1 + Math.round(2 * wS);
      ctx.fillStyle = group.dot;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      const r = 1.1 + 0.6 * wS;
      for (const s of group.list) {
        const sw = Math.sin(t * 0.6 + s.sway) * 12;
        for (let q = 0; q < per; q++) {
          const ph = (t * s.speed * speed + s.offset + q / per) % 1;
          if (ph > ease) continue;
          const [px, py] = bez(
            s,
            s.c1y + sw,
            s.c2x + sw * 0.5,
            s.c2y - sw,
            x[s.node],
            y[s.node],
            ph
          );
          ctx.moveTo(px + r, py);
          ctx.arc(px, py, r, 0, Math.PI * 2);
        }
      }
      ctx.fill();
    }

    // Threads out past the right edge.
    ctx.lineWidth = 0.5;
    for (const s of exits) {
      const sw = still ? 0 : Math.sin(t * 0.5 + s.sway) * 14;
      ctx.strokeStyle = hueStr[s.node];
      ctx.globalAlpha = s.alpha * ease;
      ctx.beginPath();
      ctx.moveTo(x[s.node], y[s.node]);
      ctx.bezierCurveTo(s.c1x, s.c1y + sw, s.c2x, s.c2y - sw, s.x1, s.y1);
      ctx.stroke();
    }

    // Lines: one stroke per colour group, then the lit ones on top.
    ctx.lineWidth = 0.55;
    ctx.globalAlpha = (0.11 + 0.06 * breath) * ease;
    for (const g of groups.values()) {
      ctx.strokeStyle = g.color;
      ctx.beginPath();
      for (const e of g.edges) {
        const [a, b] = edges[e];
        ctx.moveTo(x[a], y[a]);
        ctx.lineTo(x[b], y[b]);
      }
      ctx.stroke();
    }
    if (wT > 0.05 || waves.length) {
      ctx.strokeStyle = rgba(mix(WHITE, tideHue, 0.6), 1);
      for (let e = 0; e < edges.length; e++) {
        const [a, b] = edges[e];
        const extra =
          Math.max(lit[a], lit[b]) * 0.5 + Math.max(tide[a], tide[b]) * 0.35;
        if (extra < 0.05) continue;
        ctx.globalAlpha = extra;
        ctx.lineWidth = 0.55 + 0.6 * Math.max(lit[a], lit[b]);
        ctx.beginPath();
        ctx.moveTo(x[a], y[a]);
        ctx.lineTo(x[b], y[b]);
        ctx.stroke();
      }
    }
    if (live.hover >= 0) {
      ctx.strokeStyle = hueStr[live.hover];
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (const e of adj[live.hover]) {
        const [a, b] = edges[e];
        ctx.moveTo(x[a], y[a]);
        ctx.lineTo(x[b], y[b]);
      }
      ctx.stroke();
    }

    // Pulses: an agent's work running along the lines in its colour.
    if (!still && scene.agents.length) {
      if (pulses.length < MAX_PULSES && Math.random() < (3 + 10 * wS) * dt) {
        const from =
          scene.agents[Math.floor(Math.random() * scene.agents.length)];
        let cur = from;
        const path = [cur];
        for (let i = 0; i < 7; i++) {
          const es = adj[cur];
          if (!es.length) break;
          const [a, b] = edges[es[Math.floor(Math.random() * es.length)]];
          cur = a === cur ? b : a;
          path.push(cur);
        }
        pulses.push({ path, t: 0, color: nodes[from].hue });
      }
      ctx.lineWidth = 1.2;
      for (let i = pulses.length - 1; i >= 0; i--) {
        const pulse = pulses[i];
        pulse.t += 0.9 * speed * dt;
        const seg = Math.floor(pulse.t);
        if (seg >= pulse.path.length - 1) {
          flash[pulse.path[pulse.path.length - 1]] = now;
          pulses.splice(i, 1);
          continue;
        }
        const f = pulse.t - seg;
        const a = pulse.path[seg];
        const b = pulse.path[seg + 1];
        const px = x[a] + (x[b] - x[a]) * f;
        const py = y[a] + (y[b] - y[a]) * f;
        const back = Math.max(0, f - 0.35);
        ctx.strokeStyle = rgba(pulse.color, 1);
        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.moveTo(x[a] + (x[b] - x[a]) * back, y[a] + (y[b] - y[a]) * back);
        ctx.lineTo(px, py);
        ctx.stroke();
        ctx.globalAlpha = 0.95;
        ctx.drawImage(glowSprite(pulse.color), px - 10, py - 10, 20, 20);
      }
    }

    // Nodes: a glow stamp on the bright ones, then the dot.
    for (let i = 0; i < N; i++) {
      const n = nodes[i];
      const tw = 0.55 + 0.45 * Math.sin((t * Math.PI * 2) / BREATH_S + n.phase);
      const fl = flash[i] ? Math.max(0, 1 - (now - flash[i]) / 700) : 0;
      const a = Math.min(
        1,
        (n.real ? 0.95 : 0.3 + 0.35 * tw) * ease + lit[i] * 0.8 + fl
      );
      const pulse =
        n.kind === "agent" && (n.active || n.seen) ? 1 + 0.3 * breath : 1;
      const r = n.r * pulse * (1 + 0.8 * lit[i] + 1.2 * fl);
      if (n.real || tw > 0.8 || lit[i] > 0.2 || fl) {
        const R = r * 7;
        ctx.globalAlpha = 0.35 * a;
        ctx.drawImage(glowSprite(n.hue), x[i] - R, y[i] - R, R * 2, R * 2);
      }
      ctx.globalAlpha = a;
      ctx.fillStyle = dotStr[i];
      ctx.beginPath();
      ctx.arc(x[i], y[i], r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Rings from the agents: full strength while they work, soft when only
    // seen lately, faint otherwise.
    if (!still) {
      ctx.lineWidth = 1;
      scene.agents.forEach((i, k) => {
        const n = nodes[i];
        const strength = n.active ? 1 : n.seen ? 0.45 : 0.2;
        ctx.strokeStyle = hueStr[i];
        for (let q = 0; q < 2; q++) {
          const ph = (t / BREATH_S + k * 0.13 + q * 0.5) % 1;
          ctx.globalAlpha = 0.55 * (1 - ph) * strength;
          ctx.beginPath();
          ctx.arc(x[i], y[i], n.r + 3 + 22 * ph, 0, Math.PI * 2);
          ctx.stroke();
        }
      });
    }
    // Working now: an outline in the agent's colour, a mark, never a fill.
    ctx.lineWidth = 1.2;
    for (const i of scene.agents) {
      if (!nodes[i].active) continue;
      ctx.strokeStyle = hueStr[i];
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(x[i], y[i], nodes[i].r + 2.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Leader lines out to the result cards.
    results.forEach((res, i) => {
      const k0 = still
        ? 1
        : Math.max(0, Math.min(1, (now - born - 1100 - i * 380) / 750));
      if (!k0) return;
      const kk = 1 - Math.pow(1 - k0, 3);
      const n = res.node;
      const mid = scene.phone
        ? { x: x[n], y: res.y - 30 }
        : { x: res.x - 70, y: res.y };
      ctx.strokeStyle = rgba(res.hue, 1);
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(x[n], y[n]);
      ctx.lineTo(x[n] + (mid.x - x[n]) * kk, y[n] + (mid.y - y[n]) * kk);
      if (k0 === 1) ctx.lineTo(res.x - dx, res.y - dy);
      ctx.stroke();
      if (k0 === 1 && !still) {
        const ph = (t * 0.4 + i * 0.3) % 1;
        ctx.fillStyle = rgba(res.hue, 1);
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(
          x[n] + (mid.x - x[n]) * ph,
          y[n] + (mid.y - y[n]) * ph,
          1.6,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    });

    if (live.hover >= 0) {
      const i = live.hover;
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = "rgba(246,245,250,0.9)";
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x[i], y[i], nodes[i].r + 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1;

    // Hover: the pointer was recorded by the event; it is read here, once a
    // frame, against the positions just drawn (PORT.md §8).
    if (live.moved) {
      live.moved = false;
      let best = -1;
      if (live.pointer) {
        const mx = live.pointer.x - dx;
        const my = live.pointer.y - dy;
        let bd = 300;
        for (let i = 0; i < N; i++) {
          if (!nodes[i].real) continue;
          const d = (x[i] - mx) ** 2 + (y[i] - my) ** 2;
          if (d < bd) {
            bd = d;
            best = i;
          }
        }
      }
      if (best !== live.hover) {
        live.hover = best;
        hooks.onHover(best, live.pointer?.x ?? 0, live.pointer?.y ?? 0);
      } else if (best >= 0 && live.pointer) {
        hooks.onHover(best, live.pointer.x, live.pointer.y);
      }
    }
  };

  const loop = (now: number) => {
    raf = 0;
    if (!running) return;
    if (now - last >= FRAME_MS - 2) {
      last = now;
      frame(now);
    }
    raf = requestAnimationFrame(loop);
  };

  frame(performance.now());
  return {
    /** Start or resume the loop (not with reduced motion: one frame is the scene). */
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
  };
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
  onNewLayout,
  onOpenAgent,
  onOpenItem,
  onOpenThread,
}: {
  data: MapInput;
  seed: number;
  onNewLayout: () => void;
  onOpenAgent: (id: string) => void;
  onOpenItem: (id: string) => void;
  onOpenThread: (id: string) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const moodEl = useRef<HTMLSpanElement>(null);
  const portal = useV3PortalContainer();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [full, setFull] = useState(false);
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

  useEffect(() => {
    if (!full) return undefined;
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setFull(false);
      }
    };
    document.addEventListener("keydown", esc, true);
    return () => document.removeEventListener("keydown", esc, true);
  }, [full]);
  useEffect(() => {
    if (!full) setPresentation(false);
  }, [full]);

  const scene = useMemo(
    () => (size.w && size.h ? buildMapScene(data, seed, size.w, size.h) : null),
    [data, seed, size.w, size.h]
  );
  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  useEffect(() => {
    const el = canvas.current;
    if (!el || !scene) return undefined;
    const ctx = el.getContext?.("2d");
    if (!ctx) return undefined;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    el.width = Math.round(scene.width * dpr);
    el.height = Math.round(scene.height * dpr);
    if (moodEl.current) moodEl.current.textContent = MOODS[0];
    live.current.hover = -1;
    const run = startLoop(ctx, scene, dpr, live.current, {
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
      onMood: (mood) => {
        const m = moodEl.current;
        if (!m) return;
        m.style.opacity = "0";
        window.setTimeout(() => {
          m.textContent = MOODS[mood];
          m.style.opacity = "1";
        }, 400);
      },
    });
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
  }, [scene]);

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
  const onClick = () => {
    const s = sceneRef.current;
    const i = live.current.hover;
    if (!s || i < 0) return;
    const node = s.nodes[i];
    if (node.kind === "agent") onOpenAgent(node.id);
    else if (node.kind === "item") onOpenItem(node.id);
    else if (node.kind === "thread") onOpenThread(node.id);
  };

  const agents = scene ? scene.agents.map((i) => scene.nodes[i]) : [];
  const body = (
    <div
      ref={panel}
      className={"ag-map-panel" + (full ? " is-full" : "")}
      data-ag-map=""
      data-ag-map-seed={seed}
      data-ag-map-phone={scene?.phone ? "" : undefined}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      onClick={onClick}
    >
      <canvas ref={canvas} className="ag-map-canvas" aria-hidden="true" />
      <div className="ag-map-bar">
        <span className="ag-map-live">
          <i aria-hidden="true" />
          Live
        </span>
        <span ref={moodEl} className="ag-map-mood" data-ag-map-mood="">
          {MOODS[0]}
        </span>
        <span className="ag-map-sp" />
        {full ? (
          <button
            type="button"
            className="ag-map-ib"
            aria-pressed={presentation}
            data-ag-map-presentation=""
            onClick={(e) => {
              e.stopPropagation();
              setPresentation(!presentation);
            }}
          >
            <FiMonitor size={14} aria-hidden />
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
          {full ? "Exit" : "Full screen"}
        </button>
      </div>
      {scene ? (
        <div className="ag-map-legend" aria-label="Sources">
          {scene.sources.map((s) => (
            <span key={s.id}>
              <i style={{ background: `rgb(${keyOf(s.hue)})` }} aria-hidden />
              {s.label}
            </span>
          ))}
        </div>
      ) : null}
      {scene?.results.map((r, i) => (
        <button
          key={r.id}
          type="button"
          className="ag-map-out"
          data-ag-map-result={r.id}
          style={{
            left: scene.phone ? r.x - scene.width * 0.23 : r.x + 14,
            top: scene.phone ? r.y + 12 : r.y - 24,
            animationDelay: `${1650 + i * 380}ms`,
          }}
          onClick={(e) => {
            e.stopPropagation();
            onOpenItem(r.id);
          }}
        >
          <b>
            <i style={{ background: `rgb(${keyOf(r.hue)})` }} aria-hidden />
            {presentation ? "Finished task" : r.title}
          </b>
          <span>{[r.by, shortWhen(r.at)].filter(Boolean).join(" · ")}</span>
        </button>
      ))}
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
  if (!full || !portal) return body;
  // The panel leaves its place in the page for the window; a placeholder of
  // the same height keeps the page from jumping under it.
  return (
    <>
      <div className="ag-map-panel is-placeholder" aria-hidden="true" />
      {createPortal(body, portal)}
    </>
  );
}
