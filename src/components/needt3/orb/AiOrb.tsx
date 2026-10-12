"use client";

/* AI ORB — the mark for Needt's AI (prototype AiOrb.jsx).
 *
 * A small glowing sphere in the sky's colours (tokens --orb-*); it does not
 * follow the accent. Nothing loops at rest: the orb settles in once on mount,
 * plays one cycle when its host control is hovered or focused, and turns and
 * breathes only while `active` (Needt thinking or streaming). When that ends
 * the film finishes its turn to the rest angle and every animation is
 * cancelled, so `document.getAnimations()` is empty at rest. Reduced motion:
 * nothing plays.
 */
import * as React from "react";

const TURN_MS = 9000;
const BREATHE_MS = 7000;
const EASE = "cubic-bezier(0.2, 0.7, 0.2, 1)";
const GLOW_LOOP: Keyframe[] = [
  { opacity: 1, transform: "scale(1)" },
  { opacity: 0.7, transform: "scale(0.96)", offset: 0.3 },
  { opacity: 1, transform: "scale(1.04)", offset: 0.75 },
  { opacity: 1, transform: "scale(1)" },
];

function calm(): boolean {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

interface OrbMotion {
  enter: () => void;
  start: (forever: boolean) => void;
  looping: () => boolean;
  stop: () => void;
  dispose: () => void;
}

function orbMotion(film: SVGGElement, glow: SVGCircleElement): OrbMotion {
  let loop: Animation | null = null;
  let glowLoop: Animation | null = null;
  let settle: Animation[] = [];
  const clear = () => {
    settle.forEach((a) => a.cancel());
    settle = [];
  };
  const once = (a: Animation) => {
    a.onfinish = () => a.cancel();
    return a;
  };
  const angle = () => {
    if (!loop) return 0;
    const t = Number(loop.currentTime) || 0;
    return ((t % TURN_MS) / TURN_MS) * 360;
  };
  const can = () => !calm() && typeof film.animate === "function";
  return {
    enter() {
      if (!can()) return;
      clear();
      settle = [
        once(
          film.animate(
            [{ transform: "rotate(-60deg)" }, { transform: "rotate(0deg)" }],
            { duration: 1400, easing: EASE }
          )
        ),
        once(
          glow.animate(
            [
              { opacity: 0.7, transform: "scale(0.96)" },
              { opacity: 1, transform: "scale(1.04)", offset: 0.55 },
              { opacity: 1, transform: "scale(1)" },
            ],
            { duration: 1400, easing: "ease-in-out" }
          )
        ),
      ];
    },
    start(forever) {
      if (!can()) return;
      if (loop && glowLoop) {
        if (forever) {
          loop.effect?.updateTiming({ iterations: Infinity });
          glowLoop.effect?.updateTiming({ iterations: Infinity });
          loop.onfinish = null;
        }
        return;
      }
      clear();
      const iterations = forever ? Infinity : 1;
      const l = film.animate(
        [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
        { duration: TURN_MS, iterations }
      );
      const g = glow.animate(GLOW_LOOP, {
        duration: BREATHE_MS,
        iterations,
        easing: "ease-in-out",
      });
      loop = l;
      glowLoop = g;
      if (!forever) {
        l.onfinish = () => {
          l.cancel();
          g.cancel();
          if (loop === l) {
            loop = null;
            glowLoop = null;
          }
        };
      }
    },
    looping() {
      return !!loop && loop.effect?.getTiming().iterations === Infinity;
    },
    stop() {
      if (!loop || !glowLoop) return;
      const from = angle();
      const cs = getComputedStyle(glow);
      const gFrom: Keyframe = {
        opacity: cs.opacity,
        transform: cs.transform === "none" ? "scale(1)" : cs.transform,
      };
      loop.cancel();
      glowLoop.cancel();
      loop = null;
      glowLoop = null;
      const left = 360 - from;
      settle = [
        once(
          film.animate(
            [
              { transform: `rotate(${from}deg)` },
              { transform: "rotate(360deg)" },
            ],
            {
              duration: Math.max(240, Math.min(900, left * 5)),
              easing: "cubic-bezier(0.3, 0.6, 0.3, 1)",
            }
          )
        ),
        once(
          glow.animate([gFrom, { opacity: 1, transform: "scale(1)" }], {
            duration: 420,
            easing: "ease-out",
          })
        ),
      ];
    },
    dispose() {
      clear();
      loop?.cancel();
      glowLoop?.cancel();
      loop = null;
      glowLoop = null;
    },
  };
}

export interface AiOrbProps {
  /** Rendered px (16–40; the drawing is a 40-unit box). */
  size?: number;
  /** False drops the tinted round tile. */
  tile?: boolean;
  /** aria-label; without it the orb is decorative. */
  label?: string;
  className?: string;
  /** True while the AI is working (thinking / streaming). */
  active?: boolean;
}

export function AiOrb({
  size = 20,
  tile = true,
  label,
  className,
  active = false,
}: AiOrbProps) {
  const id = `aio${React.useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const u = (k: string) => `url(#${id}${k})`;
  const svg = React.useRef<SVGSVGElement>(null);
  const film = React.useRef<SVGGElement>(null);
  const glow = React.useRef<SVGCircleElement>(null);
  const motion = React.useRef<OrbMotion | null>(null);
  const hot = React.useRef({ hover: false, active: false });

  const sync = React.useCallback(() => {
    const m = motion.current;
    if (!m) return;
    if (hot.current.active) m.start(true);
    else if (hot.current.hover && !m.looping()) m.start(false);
    else m.stop();
  }, []);

  React.useEffect(() => {
    const el = svg.current;
    if (!el || !film.current || !glow.current) return undefined;
    const m = orbMotion(film.current, glow.current);
    motion.current = m;
    m.enter();
    const host = el.parentElement?.closest("button, a, [role=button]") ?? el;
    const on = () => {
      hot.current.hover = true;
      sync();
    };
    const off = () => {
      hot.current.hover = false;
      sync();
    };
    host.addEventListener("pointerenter", on);
    host.addEventListener("pointerleave", off);
    host.addEventListener("focusin", on);
    host.addEventListener("focusout", off);
    return () => {
      host.removeEventListener("pointerenter", on);
      host.removeEventListener("pointerleave", off);
      host.removeEventListener("focusin", on);
      host.removeEventListener("focusout", off);
      m.dispose();
      motion.current = null;
    };
  }, [sync]);

  React.useEffect(() => {
    hot.current.active = active;
    sync();
  }, [active, sync]);

  return (
    <svg
      ref={svg}
      className={`ai-orb${className ? ` ${className}` : ""}`}
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : "true"}
      focusable="false"
    >
      <defs>
        <radialGradient id={`${id}b`} cx="0.36" cy="0.3" r="0.78">
          <stop offset="0" className="ai-orb-s-hi" />
          <stop offset="0.42" className="ai-orb-s-blue" />
          <stop offset="1" className="ai-orb-s-deep" />
        </radialGradient>
        <radialGradient id={`${id}p`}>
          <stop offset="0" className="ai-orb-s-pink" />
          <stop offset="1" className="ai-orb-s-pink ai-orb-s-0" />
        </radialGradient>
        <radialGradient id={`${id}l`}>
          <stop offset="0" className="ai-orb-s-lilac" />
          <stop offset="1" className="ai-orb-s-lilac ai-orb-s-0" />
        </radialGradient>
        <radialGradient id={`${id}c`}>
          <stop offset="0" className="ai-orb-s-pale" />
          <stop offset="1" className="ai-orb-s-pale ai-orb-s-0" />
        </radialGradient>
        <radialGradient id={`${id}h`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" className="ai-orb-s-spec" />
          <stop offset="1" className="ai-orb-s-spec ai-orb-s-0" />
        </radialGradient>
        <radialGradient id={`${id}r`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.78" className="ai-orb-s-rim ai-orb-s-0" />
          <stop offset="0.97" className="ai-orb-s-rim" />
          <stop offset="1" className="ai-orb-s-rim ai-orb-s-0" />
        </radialGradient>
        <radialGradient id={`${id}g`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0.45" className="ai-orb-s-glow" />
          <stop offset="1" className="ai-orb-s-glow ai-orb-s-0" />
        </radialGradient>
        <clipPath id={`${id}k`}>
          <circle cx="20" cy="20" r="12.6" />
        </clipPath>
      </defs>
      {tile ? <circle className="ai-orb-tile" cx="20" cy="20" r="20" /> : null}
      <circle
        ref={glow}
        className="ai-orb-glow"
        cx="20"
        cy="20"
        r="18"
        fill={u("g")}
      />
      <circle cx="20" cy="20" r="12.6" fill={u("b")} />
      <g clipPath={u("k")}>
        <g ref={film} className="ai-orb-film">
          <ellipse cx="27" cy="25.5" rx="10" ry="7.5" fill={u("p")} />
          <ellipse cx="12.5" cy="26" rx="8" ry="7" fill={u("l")} />
          <ellipse cx="24" cy="11" rx="8" ry="5.5" fill={u("c")} />
        </g>
        <circle cx="20" cy="20" r="12.6" fill={u("r")} />
      </g>
      <ellipse
        cx="15.2"
        cy="13.6"
        rx="5.4"
        ry="3.4"
        transform="rotate(-32 15.2 13.6)"
        fill={u("h")}
      />
      <circle className="ai-orb-spark" cx="13.4" cy="12.6" r="1.25" />
    </svg>
  );
}
