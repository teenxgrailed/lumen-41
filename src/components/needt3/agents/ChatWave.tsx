"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

/**
 * The Chat's voice wave (owner's final reference, 05.11.26): 19 rounded
 * capsules with blurred ghosts behind, breathing at 5.2 s. Four modes:
 * "chat" (large, centred, the empty state), "think" (it contracts into a
 * dot while Needt AI thinks), "dock" (small, at the top, once the
 * conversation has started) and "thinkdock" (a dot at the top). It runs on
 * its own canvas only while the Chat is open; reduced motion draws one
 * still frame.
 */
export type WaveMode = "chat" | "think" | "dock" | "thinkdock";

export interface WaveHandle {
  /** A burst of energy (a message sent, an answer arriving). */
  spike: (v?: number) => void;
  /** A ripple spreading across the capsules. */
  ripple: (a?: number) => void;
}

const NB = 19;
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
const easeOut = (u: number) => 1 - Math.pow(1 - u, 3);

function reducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export const ChatWave = forwardRef<
  WaveHandle,
  { mode: WaveMode; onLayout?: (hintTop: number) => void }
>(function ChatWave({ mode, onLayout }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const energy = useRef({
    e: 0,
    ripples: [] as { t: number; a: number }[],
    time: 0,
  });
  /** Set by the loop: snaps and redraws a still (reduced-motion) wave. */
  const snap = useRef<() => void>(() => undefined);

  useImperativeHandle(ref, () => ({
    spike: (v = 1) => {
      energy.current.e = Math.max(energy.current.e, v);
    },
    ripple: (a = 0.6) => {
      energy.current.ripples.push({ t: energy.current.time, a });
    },
  }));

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext?.("2d");
    if (!el || !ctx) return undefined;
    const still = reducedMotion();
    // Safari repaints canvas shadows at a high cost: none there (owner's
    // report, 05.11.26). Everywhere, 30 frames a second is plenty.
    const safari =
      typeof navigator !== "undefined" &&
      /Safari\//.test(navigator.userAgent) &&
      !/Chrome|Chromium|CriOS|Edg\//.test(navigator.userAgent);
    const shadows = !safari;
    const FRAME = 1000 / 30;
    let drawn = 0;
    const hs = new Float32Array(NB);
    const gs = new Float32Array(NB);
    const P = { cx: 0, cy: 0, sc: 1, amp: 0.5, spread: 1 };
    let W = 0;
    let H = 0;
    let D = 1;
    let mob = false;
    let L = { barW: 8.5, sp: 18.5, maxH: 150 };
    const t0 = 0;
    let raf = 0;
    let last = performance.now();
    const E = energy.current;

    const target = (m: WaveMode) => {
      const top = mob ? 112 : 92;
      const y0 = H * (mob ? 0.3 : 0.36);
      return {
        chat: { cx: W / 2, cy: y0, sc: 1, amp: 0.72, spread: 1 },
        think: { cx: W / 2, cy: y0, sc: 1, amp: 0, spread: 0.05 },
        dock: { cx: W / 2, cy: top, sc: 0.4, amp: 0.8, spread: 1 },
        thinkdock: { cx: W / 2, cy: top, sc: 0.4, amp: 0, spread: 0.06 },
      }[m];
    };
    const layout = () => {
      const box = el.parentElement;
      W = box?.clientWidth || window.innerWidth;
      H = box?.clientHeight || window.innerHeight;
      D = Math.min(2, window.devicePixelRatio || 1);
      mob = W < 700;
      el.width = Math.round(W * D);
      el.height = Math.round(H * D);
      L = {
        barW: mob ? 5.5 : 8.5,
        sp: mob ? 10.5 : 18.5,
        maxH: mob ? 98 : 150,
      };
      Object.assign(P, target(modeRef.current));
      onLayout?.(H * (mob ? 0.3 : 0.36) + L.maxH * 0.5 + (mob ? 40 : 46));
    };
    const update = (dt: number) => {
      E.time += dt;
      const k = 1 - Math.exp(-dt * 4.2);
      const T = target(modeRef.current);
      P.cx = lerp(P.cx, T.cx, k);
      P.cy = lerp(P.cy, T.cy, k);
      P.sc = lerp(P.sc, T.sc, k);
      P.amp = lerp(P.amp, T.amp, k);
      P.spread = lerp(P.spread, T.spread, k);
      const intro = easeOut(clamp((E.time - t0) / 1.4));
      E.e *= Math.exp(-dt * 1.5);
      while (E.ripples.length && E.time - E.ripples[0].t > 3) E.ripples.shift();
      const mh = L.maxH * P.sc;
      const br = 1 + 0.055 * Math.sin((E.time * Math.PI * 2) / 5.2);
      const mid = (NB - 1) / 2;
      const kk = 1 - Math.exp(-dt * 13);
      for (let i = 0; i < NB; i++) {
        const n = (i - mid) / mid;
        const env = Math.exp(-n * n * 2.7);
        const v =
          (Math.sin(E.time * 1.7 + i * 1.31) * 0.6 +
            Math.sin(E.time * 2.9 + i * 0.77 + 2) * 0.4) *
            0.5 +
          0.5;
        const v2 =
          (Math.sin(E.time * 1.3 + i * 1.9 + 1) * 0.55 +
            Math.sin(E.time * 2.3 + i * 0.5 + 4) * 0.45) *
            0.5 +
          0.5;
        const x = P.cx + (i - mid) * L.sp * P.sc * P.spread;
        let r = 0;
        for (const q of E.ripples) {
          const age = E.time - q.t;
          const d = Math.abs(x - P.cx);
          r +=
            q.a *
            Math.exp(-Math.pow((d - 300 * age) / (46 * P.sc + 10), 2)) *
            Math.exp(-age * 1.5);
        }
        const base = P.amp * br * intro;
        const h =
          mh *
            (base * env * (0.34 + 0.66 * v) +
              P.amp * E.e * env * 0.95 * (0.55 + 0.45 * v) +
              P.amp * r * (0.25 + 0.6 * env) * 0.6) +
          L.barW * P.sc;
        const g =
          mh *
            (base * env * (0.5 + 0.8 * v2) * 1.05 + P.amp * E.e * env * 0.7) +
          L.barW * P.sc;
        hs[i] = lerp(hs[i], Math.min(h, mh * 1.45), kk);
        gs[i] = lerp(gs[i], Math.min(g, mh * 1.6), kk);
      }
    };
    const draw = () => {
      ctx.setTransform(D, 0, 0, D, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const mh = L.maxH * P.sc;
      const wp = clamp(P.amp * 2 + 0.15);
      const intro = clamp((E.time - t0) / 1.4);
      // The blue pool under the wave.
      const gy = P.cy + mh * 0.62;
      const rad = Math.max(L.sp * NB * P.sc * 1.7, 150);
      const gl = (0.5 + 0.5 * wp) * (1 + E.e * 0.5) * clamp(intro * 1.4);
      ctx.save();
      ctx.translate(P.cx, gy);
      ctx.scale(1, 0.3);
      const pool = ctx.createRadialGradient(0, 0, 0, 0, 0, rad);
      pool.addColorStop(0, `rgba(90,169,255,${0.33 * gl})`);
      pool.addColorStop(0.45, `rgba(90,169,255,${0.1 * gl})`);
      pool.addColorStop(1, "rgba(90,169,255,0)");
      ctx.fillStyle = pool;
      ctx.fillRect(-rad, -rad, rad * 2, rad * 2);
      ctx.restore();
      const mid = (NB - 1) / 2;
      const bw = L.barW * P.sc;
      const dot = clamp(1 - P.amp * 6);
      const capsule = (x: number, y: number, w: number, h: number) => {
        ctx.beginPath();
        if (typeof ctx.roundRect === "function")
          ctx.roundRect(x, y, w, h, w / 2);
        else ctx.rect(x, y, w, h);
      };
      // Ghosts first (soft, wide shadow), then the capsules.
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < NB; i++) {
          const n = (i - mid) / mid;
          const env = Math.exp(-n * n * 2.7);
          const x = P.cx + (i - mid) * L.sp * P.sc * P.spread;
          ctx.save();
          if (pass === 0) {
            const h = gs[i];
            if (shadows) {
              ctx.shadowColor = "rgba(255,255,255,.18)";
              ctx.shadowBlur = 16 * D;
            }
            ctx.fillStyle = `rgba(255,255,255,${0.07 + 0.05 * env})`;
            capsule(x - bw * 0.5, P.cy - h / 2, bw, h);
          } else {
            const h = hs[i];
            const a = 0.34 + 0.66 * Math.pow(env, 0.7);
            if (shadows) {
              ctx.shadowColor = `rgba(255,255,255,${0.22 + 0.3 * env})`;
              ctx.shadowBlur = 12 * D;
            }
            const g = ctx.createLinearGradient(
              0,
              P.cy - h / 2,
              0,
              P.cy + h / 2
            );
            g.addColorStop(0, `rgba(255,255,255,${a * 0.55})`);
            g.addColorStop(0.5, `rgba(255,255,255,${a})`);
            g.addColorStop(1, `rgba(255,255,255,${a * 0.55})`);
            ctx.fillStyle = g;
            capsule(x - bw / 2, P.cy - h / 2, bw, h);
          }
          ctx.fill();
          ctx.restore();
        }
      }
      // Thinking: the wave is one glowing dot.
      if (dot > 0.01) {
        const r = (16 + 3 * Math.sin(E.time * 2.2)) * P.sc * (mob ? 0.85 : 1);
        const g = ctx.createRadialGradient(P.cx, P.cy, 0, P.cx, P.cy, r * 2.6);
        g.addColorStop(0, `rgba(255,255,255,${0.9 * dot})`);
        g.addColorStop(0.25, `rgba(90,169,255,${0.4 * dot})`);
        g.addColorStop(1, "rgba(90,169,255,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(P.cx, P.cy, r * 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) {
        last = now;
        return;
      }
      if (now - drawn < FRAME - 2) return;
      drawn = now;
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      last = now;
      update(dt);
      draw();
    };

    snap.current = () => {
      if (!still) return;
      Object.assign(P, target(modeRef.current));
      for (let i = 0; i < 6; i++) update(0.3);
      draw();
    };
    layout();
    if (still) {
      for (let i = 0; i < 6; i++) update(0.3);
      draw();
    } else {
      raf = requestAnimationFrame(frame);
    }
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver === "function" && el.parentElement) {
      ro = new ResizeObserver(() => {
        layout();
        if (still) draw();
      });
      ro.observe(el.parentElement);
    }
    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro?.disconnect();
    };
    // onLayout is a setter from the parent; the loop runs once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    snap.current();
  }, [mode]);

  return <canvas ref={canvas} className="ag-chat-wave" aria-hidden="true" />;
});
