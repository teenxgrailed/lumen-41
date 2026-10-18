"use client";

import type { CSSProperties } from "react";

import { pkCx } from "../kit";
import type { HabitDot } from "./habits-row";

const R = 17;
const C = 2 * Math.PI * R;

/**
 * One horizontal row of habit circles under the date. Each is a button: tap
 * to keep today (or take it back). It scrolls sideways when there are many,
 * and draws nothing when there are no habits.
 */
export function HabitsStrip({
  dots,
  onTick,
}: {
  dots: readonly HabitDot[];
  onTick: (id: string, done: boolean) => void;
}) {
  if (!dots.length) return null;
  return (
    <div className="hs-row" data-hs-row="" role="group" aria-label="Habits">
      {dots.map((d) => (
        <button
          key={d.id}
          type="button"
          className={pkCx("hs-dot", d.on && "is-on")}
          style={{ "--hue": d.hue } as CSSProperties}
          aria-pressed={d.on}
          aria-label={d.say}
          data-hs-dot={d.id}
          onClick={() => onTick(d.id, !d.on)}
        >
          <svg className="hs-ring" viewBox="0 0 40 40" aria-hidden="true">
            <circle className="hs-track" cx="20" cy="20" r={R} />
            <circle
              className="hs-arc"
              cx="20"
              cy="20"
              r={R}
              strokeDasharray={`${(C * d.frac).toFixed(1)} ${C.toFixed(1)}`}
            />
          </svg>
          <span className="hs-mark">{d.mark}</span>
        </button>
      ))}
    </div>
  );
}
