"use client";

/* THE EXPOSURE WORDMARK (prototype ExposureWordmark.jsx, final of 09.10.26).
 *
 * "Needt" in Exposure VAR, one inline-block span per letter, animating only
 * `font-variation-settings` on EXPO (-100 .. +100, resting 0). The font is
 * duplexed, so nothing in the layout can move.
 *
 * Motions: DEVELOP-IN once on mount (a CSS animation); BUSY (a prop, 55);
 * TORCH (pointer, springs); BREATHE and PULSE. At REST the word is a still
 * frame (owner, 08.10.26): breathe and pulse play for ONE wave after the
 * develop-in, the amplitude eases to 0 and the rAF loop stops itself. Hover and
 * busy wake it; leaving lets the torch spring home and stops. The 19 s lean
 * is not ported (it looped at rest).
 *
 * One rAF for the whole word, written straight to each span (no React state per
 * frame); stops when the element is off-screen, the tab is hidden, reduced
 * motion is on, or nothing is left to resolve; resumes in phase.
 */
import * as React from "react";

import {
  EW_BREATHE,
  EW_BUSY_CEILING,
  EW_BUSY_DOWN_MS,
  EW_BUSY_UP_MS,
  EW_DEVELOP_MS,
  EW_DEVELOP_STAGGER_MS,
  EW_MIN_SIZE,
  EW_PULSE,
  EW_RADIUS,
  EW_SPRING,
  type SpringState,
  axisRangeForSize,
  breatheAt,
  composeAxisValue,
  ewClamp,
  ewEaseOutCubic,
  liftFor,
  pulseAt,
  springSettled,
  springStep,
  torchTargetAt,
} from "./axis";

export type ExposureWordmarkMode = "still" | "breathe" | "breathe+pulse";

export interface ExposureWordmarkProps {
  size?: number;
  title?: string;
  /** "still" parks the word; "breathe" plays one wave after the develop-in. */
  mode?: ExposureWordmarkMode;
  /** The scheduler is writing: holds the word at 55. */
  busy?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

/** Time (ms on the loop's clock) at which the one rest wave has finished. */
export function waveEndsAt(letters: number): number {
  return (
    EW_DEVELOP_MS +
    letters * EW_DEVELOP_STAGGER_MS +
    EW_BREATHE.cycle +
    (letters - 1) * EW_BREATHE.offset
  );
}

interface Clock {
  t: number;
  pulseAt: number;
  amp: number;
  ampTo: number;
  ampFrom: number;
  ampAt: number;
  ampDur: number;
  busy: number;
  busyFrom: number;
  busyAt: number;
  busyDur: number;
}

const freshClock = (): Clock => ({
  t: 0,
  pulseAt: -1e9,
  amp: 1,
  ampTo: 1,
  ampFrom: 1,
  ampAt: 0,
  ampDur: 250,
  busy: 0,
  busyFrom: 0,
  busyAt: 0,
  busyDur: EW_BUSY_UP_MS,
});

export function ExposureWordmark({
  size = 28,
  title = "Needt",
  mode = "still",
  busy = false,
  className,
  style,
}: ExposureWordmarkProps) {
  const px = size;
  const text = title || "Needt";
  const letters = React.useMemo(() => text.split(""), [text]);
  const host = React.useRef<HTMLHeadingElement | null>(null);
  const spans = React.useRef<Array<HTMLSpanElement | null>>([]);
  const torch = React.useRef<SpringState[]>([]);
  const clock = React.useRef<Clock>(freshClock());
  const frame = React.useRef(0);
  const last = React.useRef(0);
  const waveOn = React.useRef(true);

  const [onScreen, setOnScreen] = React.useState(true);
  const [awake, setAwake] = React.useState(
    typeof document === "undefined" || !document.hidden
  );
  /* Read synchronously where it can be: starting false let one breathe frame
     be written before the reduced-motion check landed. */
  const [calm, setCalm] = React.useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const [developing, setDeveloping] = React.useState(false);

  const { floor, roof, ceiling } = axisRangeForSize(px);
  const live = onScreen && awake && !calm && px >= EW_MIN_SIZE;
  const looping = live && (mode === "breathe" || mode === "breathe+pulse");
  const pulsing = live && mode === "breathe+pulse" && ceiling > 0;

  React.useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const q = window.matchMedia("(prefers-reduced-motion: reduce)");
    const read = () => setCalm(q.matches);
    read();
    q.addEventListener("change", read);
    return () => q.removeEventListener("change", read);
  }, []);

  React.useEffect(() => {
    const read = () =>
      setAwake(!document.hidden && document.visibilityState !== "hidden");
    read();
    document.addEventListener("visibilitychange", read);
    window.addEventListener("focus", read);
    window.addEventListener("pageshow", read);
    return () => {
      document.removeEventListener("visibilitychange", read);
      window.removeEventListener("focus", read);
      window.removeEventListener("pageshow", read);
    };
  }, []);

  /* Visibility is measured from the node's own rect and only ever PARKS the
     word on a confirmed off-screen reading; IntersectionObserver is one more
     signal, never the source of truth. */
  React.useEffect(() => {
    const el = host.current;
    if (!el) return undefined;
    let alive = true;
    let queued = 0;
    const shown = (): boolean | null => {
      const r = el.getBoundingClientRect();
      if (!r.height) return null;
      const h = window.innerHeight || document.documentElement.clientHeight;
      const w = window.innerWidth || document.documentElement.clientWidth;
      if (!h || !w) return null;
      const vis = Math.min(r.bottom, h) - Math.max(r.top, 0);
      return r.right > 0 && r.left < w && vis / r.height >= 0.25;
    };
    const measure = () => {
      if (!alive) return;
      const v = shown();
      if (v === null) {
        window.requestAnimationFrame(measure);
        return;
      }
      setOnScreen(v);
    };
    const onScroll = () => {
      if (queued) return;
      queued = window.requestAnimationFrame(() => {
        queued = 0;
        measure();
      });
    };
    measure();
    window.addEventListener("scroll", onScroll, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", onScroll, { passive: true });
    document.fonts?.ready.then(measure).catch(() => undefined);
    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(() => measure(), { threshold: 0.25 });
      io.observe(el);
    }
    return () => {
      alive = false;
      if (queued) window.cancelAnimationFrame(queued);
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onScroll);
      io?.disconnect();
    };
  }, []);

  /* One resolved value for letter `i` at the clock's time: the single source
     both the per-frame loop and the develop-in hand-off read. */
  const resolve = React.useCallback(
    (i: number): number => {
      const c = clock.current;
      const s = torch.current[i];
      const base = looping
        ? breatheAt(c.t, i) * c.amp +
          (pulsing ? pulseAt(c.t - c.pulseAt, i) : 0)
        : 0;
      return composeAxisValue({
        breathe: base,
        pulse: 0,
        torch: s ? s.v : 0,
        floor,
        roof,
        busy: c.busy,
      });
    },
    [looping, pulsing, floor, roof]
  );
  const resolveRef = React.useRef(resolve);
  resolveRef.current = resolve;

  const write = React.useCallback((i: number, v: number) => {
    const el = spans.current[i];
    if (!el) return;
    el.style.fontVariationSettings = `"EXPO" ${Math.round(v * 10) / 10}`;
    el.style.setProperty("--ew-lift", String(liftFor(v)));
  }, []);

  const ensureSprings = React.useCallback(() => {
    for (let i = 0; i < letters.length; i++) {
      if (!torch.current[i]) torch.current[i] = { v: 0, vel: 0, target: 0 };
    }
  }, [letters.length]);

  const stop = React.useCallback(() => {
    if (frame.current) {
      window.cancelAnimationFrame(frame.current);
      frame.current = 0;
    }
  }, []);

  /* ONE loop. It runs while anything is unresolved and stops itself otherwise,
     so a still word costs nothing. */
  const run = React.useCallback(() => {
    if (frame.current) return;
    last.current = performance.now();
    const step = (now: number) => {
      const dt = Math.min(now - last.current, 1000 / 30);
      last.current = now;
      if (document.hidden) {
        frame.current = 0;
        return;
      }
      const c = clock.current;
      c.t += dt;

      /* The breathe amplitude, and busy, are tweens on the same clock. */
      if (c.amp !== c.ampTo) {
        const t = ewClamp((c.t - c.ampAt) / c.ampDur, 0, 1);
        c.amp = c.ampFrom + (c.ampTo - c.ampFrom) * ewEaseOutCubic(t);
        if (t >= 1) c.amp = c.ampTo;
      }
      const busyTo = busy ? Math.min(EW_BUSY_CEILING, ceiling) : 0;
      if (c.busy !== busyTo) {
        const t = ewClamp((c.t - c.busyAt) / c.busyDur, 0, 1);
        c.busy = c.busyFrom + (busyTo - c.busyFrom) * ewEaseOutCubic(t);
        if (t >= 1) c.busy = busyTo;
      }

      /* One wave across every letter (on the loop's own clock, so a pause
         off-screen does not cut it short), then ease to the still frame. */
      if (waveOn.current && c.t >= waveEndsAt(letters.length)) {
        waveOn.current = false;
        c.ampFrom = c.amp;
        c.ampTo = 0;
        c.ampAt = c.t;
        c.ampDur = 600;
      }
      if (pulsing && waveOn.current && c.t - c.pulseAt >= EW_PULSE.every)
        c.pulseAt = c.t;
      const pulseLive =
        pulsing &&
        c.t - c.pulseAt < EW_PULSE.dur + letters.length * EW_PULSE.stagger;

      /* Still once the wave has eased out: amplitude at 0, no pulse in flight,
         busy resolved, every spring home. */
      let moving =
        (looping && (c.amp > 0.001 || c.ampTo > 0)) ||
        pulseLive ||
        c.amp !== c.ampTo ||
        c.busy !== busyTo;
      for (let i = 0; i < letters.length; i++) {
        const s = torch.current[i];
        if (!s) continue;
        const next = springStep(s, dt, EW_SPRING);
        if (!springSettled(next)) {
          moving = true;
          torch.current[i] = next;
        } else {
          torch.current[i] = { v: next.target, vel: 0, target: next.target };
        }
        if (!developing) write(i, resolveRef.current(i));
      }

      frame.current = moving ? window.requestAnimationFrame(step) : 0;
    };
    frame.current = window.requestAnimationFrame(step);
  }, [busy, ceiling, developing, letters.length, looping, pulsing, write]);

  /* Mount: attach the engine and prove it by writing the resting value. */
  React.useEffect(() => {
    ensureSprings();
    for (let i = 0; i < letters.length; i++) write(i, 0);
    return stop;
  }, [ensureSprings, letters.length, stop, write]);

  /* DEVELOP-IN: once, the first time the word is live. The CSS animation
     outranks inline writes while it runs, so on hand-off each letter's current
     value is written inline BEFORE the class comes off. */
  const developed = React.useRef(false);
  React.useEffect(() => {
    if (!live || developed.current) return undefined;
    developed.current = true;
    setDeveloping(true);
    const id = window.setTimeout(
      () => {
        ensureSprings();
        for (let i = 0; i < letters.length; i++)
          write(i, resolveRef.current(i));
        setDeveloping(false);
      },
      EW_DEVELOP_MS + letters.length * EW_DEVELOP_STAGGER_MS + 40
    );
    return () => window.clearTimeout(id);
  }, [ensureSprings, letters.length, live, write]);

  /* The loop is bound to the conditions, not to a trigger. */
  React.useEffect(() => {
    ensureSprings();
    if (!live) {
      stop();
      return undefined;
    }
    if (looping || busy) run();
    return undefined;
  }, [live, looping, busy, ensureSprings, run, stop]);

  React.useEffect(() => {
    const c = clock.current;
    c.busyFrom = c.busy;
    c.busyAt = c.t;
    c.busyDur = busy ? EW_BUSY_UP_MS : EW_BUSY_DOWN_MS;
    if (live) run();
  }, [busy, live, run]);

  const amplitudeTo = (v: number, dur: number) => {
    const c = clock.current;
    c.ampFrom = c.amp;
    c.ampTo = v;
    c.ampAt = c.t;
    c.ampDur = dur;
  };

  const onMove = (e: React.PointerEvent<HTMLHeadingElement>) => {
    if (!live || developing || busy || ceiling <= 0) return;
    ensureSprings();
    for (let i = 0; i < letters.length; i++) {
      const el = spans.current[i];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const d = Math.abs(e.clientX - (r.left + r.width / 2));
      torch.current[i] = {
        ...torch.current[i],
        target: torchTargetAt(d, EW_RADIUS, ceiling),
      };
    }
    run();
  };
  const onEnter = () => {
    if (!live || ceiling <= 0) return;
    /* The breathe steps aside so the torch reads clean. */
    amplitudeTo(0, 250);
    run();
  };
  const onLeave = () => {
    if (!live) return;
    ensureSprings();
    for (let i = 0; i < letters.length; i++)
      torch.current[i] = { ...torch.current[i], target: 0 };
    /* Back to the still frame: the breathe does not resume on its own. */
    amplitudeTo(waveOn.current ? 1 : 0, 400);
    run();
  };

  return (
    <h1
      ref={host}
      className={
        "font-display" +
        (px >= 22 ? " ew-sculpt" : "") +
        (className ? " " + className : "")
      }
      onPointerEnter={onEnter}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      style={{
        margin: 0,
        fontSize: px,
        lineHeight: 1.1,
        color: "var(--text-primary)",
        cursor: "default",
        ...style,
      }}
    >
      {letters.map((ch, i) => (
        <span
          key={i}
          aria-hidden="true"
          ref={(el) => {
            spans.current[i] = el;
          }}
          className={"ew-letter" + (developing ? " is-developing" : "")}
          style={
            {
              animationDelay: developing
                ? `${i * EW_DEVELOP_STAGGER_MS}ms`
                : undefined,
              "--ew-from": floor,
            } as React.CSSProperties
          }
        >
          {ch}
        </span>
      ))}
      <span className="sr-only">{text}</span>
    </h1>
  );
}
