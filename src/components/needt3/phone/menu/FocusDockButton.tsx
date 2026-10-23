"use client";

import { useEffect, useState } from "react";

import { clockOf } from "@/lib/needt3/focus";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { useFocusRun } from "../../focus/useFocusController";

/** Ring geometry (fd-focus.css `.fd-fbtn svg.r`): a 54 px ring inset 5 px in
 * the 64 px button, r 25, stroke 3. */
const SIZE = 54;
const STROKE = 3;
const R = 25;
const C = 2 * Math.PI * R;
/** Matches `.nva-focus-btn`'s transition; the button leaves the DOM after it. */
const OUT_MS = 240;

/** The last stretch of a session: the ring turns warm and the button breathes. */
export const ENDING_SEC = 120;

/**
 * What the ring's centre says: whole minutes left (the design's "18"), rounded
 * up so the last minute reads 1; past an hour "90m"; a session with no planned
 * length counts up as a clock.
 */
export function dockLabel(run: {
  leftSec: number | null;
  elapsedSec: number;
}): string {
  if (run.leftSec == null) return clockOf(run as never);
  const min = Math.max(0, Math.ceil(run.leftSec / 60));
  return min >= 60 ? `${min}m` : String(min);
}

/** running | paused | ending (a countdown in its last 2 minutes, not paused). */
export function dockState(run: {
  paused: boolean;
  leftSec: number | null;
}): "running" | "paused" | "ending" {
  if (run.paused) return "paused";
  if (run.leftSec != null && run.leftSec > 0 && run.leftSec <= ENDING_SEC)
    return "ending";
  return "running";
}

/**
 * The Focus button on the phone: the round glass button to the left of the
 * dock pill (the mirror of "New task"), drawn only while a session runs. The
 * time left is a ring (the accent is the ring's mark, never a fill) around the
 * clock; a paused session shows a quiet ring. Tap opens the phone Focus sheet.
 * `Menu` places the wrapper (`.nva-focus`); this is its content.
 */
export function FocusDockButton() {
  const { run } = useFocusRun();
  const setOpen = useNeedt3Ui((s) => s.setFocusOpen);
  const want = !!run;
  // Mounted while wanted and for OUT_MS after; `shown` is the entered state.
  const [mounted, setMounted] = useState(want);
  const [shown, setShown] = useState(false);
  const [last, setLast] = useState(run);
  if (run && run !== last) setLast(run);
  useEffect(() => {
    if (want) {
      setMounted(true);
      const raf = window.requestAnimationFrame(() => setShown(true));
      return () => window.cancelAnimationFrame(raf);
    }
    setShown(false);
    const id = window.setTimeout(() => setMounted(false), OUT_MS);
    return () => window.clearTimeout(id);
  }, [want]);

  const r = run ?? last;
  if (!mounted || !r) return null;
  const label = dockLabel(r);
  const state = dockState(r);
  const paused = state === "paused";
  const spoken =
    r.leftSec == null
      ? label
      : `${Math.max(0, Math.ceil(r.leftSec / 60))} min left`;
  return (
    <button
      type="button"
      className={
        "nva-focus-btn" +
        (shown ? " is-in" : "") +
        (paused ? " is-paused" : "") +
        (state === "ending" ? " is-ending" : "")
      }
      data-assistant-avoid=""
      data-nva-focus={state === "running" ? "live" : state}
      aria-label={`Focus session, ${spoken}${paused ? ", paused" : ""} — open`}
      aria-haspopup="dialog"
      tabIndex={shown ? 0 : -1}
      onClick={() => setOpen(true)}
    >
      <svg
        className="nva-focus-ring"
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        aria-hidden="true"
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="var(--nva-line)"
          strokeWidth={STROKE}
        />
        <circle
          className="nva-focus-arc"
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="var(--nva-lav)"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - Math.max(r.pct, 0.001))}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </svg>
      <span className="nva-focus-time">{label}</span>
      {paused ? (
        <span className="fd-pz" aria-hidden="true">
          <i />
          <i />
        </span>
      ) : null}
    </button>
  );
}
