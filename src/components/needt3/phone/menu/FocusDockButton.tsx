"use client";

import { useEffect, useState } from "react";

import { clockOf } from "@/lib/needt3/focus";

import { useNeedt3Ui } from "@/store/needt3-ui";

import { useFocusRun } from "../../focus/useFocusController";

/** Ring geometry: a 54 px button, the stroke 2.5 px inside its edge. */
const SIZE = 54;
const STROKE = 2.5;
const R = (SIZE - STROKE) / 2 - 3;
const C = 2 * Math.PI * R;
/** Matches `.nva-focus-btn`'s transition; the button leaves the DOM after it. */
const OUT_MS = 240;

/** What the ring's centre says: the clock, or whole minutes once it is long. */
export function dockLabel(run: {
  leftSec: number | null;
  elapsedSec: number;
}): string {
  const sec = run.leftSec ?? run.elapsedSec;
  return sec >= 3600 ? `${Math.ceil(sec / 60)}m` : clockOf(run as never);
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
  const paused = r.paused;
  return (
    <button
      type="button"
      className={
        "nva-focus-btn" + (shown ? " is-in" : "") + (paused ? " is-paused" : "")
      }
      data-assistant-avoid=""
      data-nva-focus={paused ? "paused" : "live"}
      aria-label={`Focus session, ${label}${r.leftSec == null ? "" : " left"}${paused ? ", paused" : ""} — open`}
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
          stroke="var(--accent)"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={C * (1 - Math.max(r.pct, 0.001))}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </svg>
      <span className="nva-focus-time">{label}</span>
    </button>
  );
}
