"use client";

/* THE AGENT'S CURSOR (v3) — the app's own hand, visible.
 *
 * Owner-locked (PORT.md §5): a hand, not a spring. The reach is the
 * minimum-jerk curve 10t³−15t⁴+6t⁵ over clamp(210+190·log2(d/90+1), 300, 760)
 * ms along one quadratic bezier fixed before the first frame. That maths
 * lives in `needt/cursor/motion.ts` (tested) and is imported, not copied.
 *
 * What this file owns: one rAF per reach writing `translate3d` straight to the
 * element through a ref (never React state, never left/top); the hand emerges
 * from the corner (`ac-in`) and returns into it (`ac-out`); under reduced
 * motion it does not fly — the acts still land, nothing is drawn.
 */
import * as React from "react";

import {
  boxOf,
  centreOf,
  prefersStillness,
  pressOn,
  typeInto,
  viewportBox,
} from "@/components/needt/cursor/dom";
import {
  type ArcSide,
  type Point,
  nextSide,
  planReach,
  reachAt,
} from "@/components/needt/cursor/motion";
import type {
  AgentCursorHandle,
  AgentRun,
  AgentStep,
} from "@/components/needt/cursor/types";

import { cornerHome } from "@/lib/assistant-position";

import { setAgentHand } from "./hand";

const EMERGE_MS = 300;
const RETURN_MS = 260;
const PRESS_MS = 140;
const SETTLE_MS = 420;
const CARRY_MS = 320;
const TYPE_MS = 34;
const TYPED_MS = 260;
const CARRY_MAX = { w: 240, h: 96 };

type Phase = "in" | "live" | "out";

interface Held {
  readonly w: number;
  readonly h: number;
  readonly title: string;
}

interface Active {
  readonly run: AgentRun;
  readonly settle: () => void;
  readonly still: boolean;
}

/** The arrow, what it carries and what it says, placed by one write each. */
export function placeHand(
  els: {
    arrow: HTMLElement | null;
    load: HTMLElement | null;
    bubble: HTMLElement | null;
  },
  x: number,
  y: number
): void {
  if (els.arrow) els.arrow.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  if (els.load) {
    els.load.style.transform = `translate3d(${x + 15}px, ${y + 19}px, 0) rotate(-1.5deg)`;
  }
  if (els.bubble) {
    els.bubble.style.transform = `translate3d(${x + 22}px, ${y - 9}px, 0)`;
  }
}

/** Whether any step of `run` has a target the hand could reach right now. */
export function anyTargetOnScreen(run: AgentRun): boolean {
  return run.steps.some((step) => !!boxOf(document.querySelector(step.target)));
}

export function AgentCursor() {
  const [active, setActive] = React.useState<Active | null>(null);
  const [phase, setPhase] = React.useState<Phase>("in");
  const [press, setPress] = React.useState(false);
  const [say, setSay] = React.useState<string | null>(null);
  const [held, setHeld] = React.useState<Held | null>(null);

  const arrow = React.useRef<HTMLSpanElement | null>(null);
  const load = React.useRef<HTMLSpanElement | null>(null);
  const bubble = React.useRef<HTMLSpanElement | null>(null);
  const at = React.useRef<Point>({ x: 0, y: 0 });
  const side = React.useRef<ArcSide>(-1);
  const running = React.useRef(false);
  const cut = React.useRef(false);

  const place = React.useCallback((x: number, y: number) => {
    at.current = { x, y };
    placeHand(
      { arrow: arrow.current, load: load.current, bubble: bubble.current },
      x,
      y
    );
  }, []);

  /* A caption or carried card that just mounted has never been placed. */
  React.useLayoutEffect(() => {
    if (!active || active.still) return;
    place(at.current.x, at.current.y);
  });

  const hand = React.useMemo<AgentCursorHandle>(
    () => ({
      busy: () => running.current,
      run: (run: AgentRun) =>
        new Promise<void>((settle) => {
          // Nothing on screen to reach: the hand does not come out at all.
          if (running.current || !anyTargetOnScreen(run)) {
            settle();
            return;
          }
          running.current = true;
          cut.current = false;
          setActive({ run, settle, still: prefersStillness() });
        }),
      stop: () => {
        cut.current = true;
      },
      marks: () => [],
      clearMarks: () => undefined,
    }),
    []
  );

  React.useEffect(() => {
    setAgentHand(hand);
    return () => setAgentHand(null);
  }, [hand]);

  React.useEffect(() => {
    if (!active) return undefined;
    let alive = true;
    let frame = 0;
    const timers = new Set<number>();
    const { run, settle, still } = active;

    function wait(ms: number, then: () => void) {
      const id = window.setTimeout(() => {
        timers.delete(id);
        if (alive) then();
      }, ms);
      timers.add(id);
    }

    function finish() {
      if (!alive) return;
      setSay(null);
      setHeld(null);
      setPress(false);
      running.current = false;
      setActive(null);
      settle();
    }

    function apply(el: Element, s: AgentStep, then: () => void) {
      switch (s.act.kind) {
        case "hold": {
          const box = boxOf(el);
          setPress(true);
          setHeld({
            w: Math.min(box ? box.right - box.left : CARRY_MAX.w, CARRY_MAX.w),
            h: Math.min(box ? box.bottom - box.top : CARRY_MAX.h, CARRY_MAX.h),
            title: s.act.title ?? (el.textContent ?? "").trim().slice(0, 40),
          });
          wait(still ? 0 : CARRY_MS, then);
          return;
        }
        case "drop":
          setPress(false);
          setHeld(null);
          wait(still ? 0 : CARRY_MS, then);
          return;
        case "type": {
          const text = s.act.text;
          if (still) {
            typeInto(el, text);
            wait(0, then);
            return;
          }
          let n = 0;
          const tick = () => {
            n += 1;
            typeInto(el, text.slice(0, n));
            if (n < text.length) wait(TYPE_MS, tick);
            else wait(TYPED_MS, then);
          };
          tick();
          return;
        }
        case "rest":
          wait(still ? 0 : (s.afterMs ?? SETTLE_MS), then);
          return;
        default:
          if (still) {
            pressOn(el);
            wait(0, then);
            return;
          }
          setPress(true);
          wait(PRESS_MS, () => {
            pressOn(el);
            setPress(false);
            wait(s.afterMs ?? SETTLE_MS, then);
          });
      }
    }

    /* Reduced motion: the acts land in order; nothing flies or is drawn. */
    if (still) {
      let i = 0;
      const next = () => {
        if (cut.current || i >= run.steps.length) return finish();
        const s = run.steps[i];
        i += 1;
        const el = document.querySelector(s.target);
        if (el) apply(el, s, next);
        else wait(0, next);
        return undefined;
      };
      wait(0, next);
      return () => {
        alive = false;
        timers.forEach((id) => window.clearTimeout(id));
        if (running.current) {
          running.current = false;
          settle();
        }
      };
    }

    /* Measured once, before frame 1: the corner does not move during a run. */
    const home = cornerHome(viewportBox());
    place(home.x, home.y);
    setPhase("in");

    function reach(to: Point, then: () => void) {
      side.current = nextSide(side.current);
      // The bow and the duration are fixed here, before the first frame.
      const plan = planReach(at.current, to, side.current);
      if (plan.length < 2) {
        place(to.x, to.y);
        then();
        return;
      }
      let t0 = 0;
      const step = (stamp: number) => {
        if (!alive) return;
        if (!t0) t0 = stamp;
        const elapsed = stamp - t0;
        const p = reachAt(plan, elapsed);
        place(p.x, p.y);
        if (elapsed >= plan.ms) {
          place(to.x, to.y);
          then();
          return;
        }
        frame = window.requestAnimationFrame(step);
      };
      frame = window.requestAnimationFrame(step);
    }

    function play(i: number) {
      if (!alive) return;
      if (cut.current || i >= run.steps.length) {
        setSay(null);
        setHeld(null);
        setPress(false);
        reach(home, () => {
          setPhase("out");
          wait(RETURN_MS, finish);
        });
        return;
      }
      const s = run.steps[i];
      const el = document.querySelector(s.target);
      const box = boxOf(el);
      if (!el || !box) {
        play(i + 1);
        return;
      }
      setSay(s.say ?? null);
      reach(centreOf(box), () => apply(el, s, () => play(i + 1)));
    }

    wait(EMERGE_MS, () => {
      setPhase("live");
      play(0);
    });

    return () => {
      alive = false;
      window.cancelAnimationFrame(frame);
      timers.forEach((id) => window.clearTimeout(id));
      if (running.current) {
        running.current = false;
        settle();
      }
    };
  }, [active, place]);

  if (!active || active.still) return null;

  return (
    <div className="shell-agent-cursor-layer" aria-hidden="true">
      {held ? (
        <span
          ref={load}
          className="ac-load base-strong shell-agent-cursor-load"
          style={{ width: held.w, height: held.h }}
        >
          {held.title}
        </span>
      ) : null}
      {say ? (
        <span ref={bubble} className="ac-say shell-agent-cursor-say">
          {say}
        </span>
      ) : null}
      <span
        ref={arrow}
        className={`shell-agent-cursor-layer-2 ac-arrow ac-${phase}${press ? " is-press" : ""}`}
      >
        <svg
          width="20"
          height="24"
          viewBox="0 0 20 24"
          className="shell-cursor-svg"
        >
          <path
            d="M2.6 1.6 L2.6 18.2 L7 14.1 L9.8 20.5 L12.7 19.3 L10 13.1 L15.9 12.8 Z"
            className="shell-cursor-halo"
            strokeWidth="2.6"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <path
            d="M2.6 1.6 L2.6 18.2 L7 14.1 L9.8 20.5 L12.7 19.3 L10 13.1 L15.9 12.8 Z"
            className="shell-cursor-ink"
            strokeWidth="0.5"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </div>
  );
}
