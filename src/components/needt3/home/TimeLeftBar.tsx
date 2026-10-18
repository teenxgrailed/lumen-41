"use client";

import { type TimeLeft, timeLeftLine } from "./timeleft";

/**
 * A thin line: planned work against the free time left today, with a soft
 * warning when overbooked. Drawn only when there is something to compare.
 */
export function TimeLeftBar({ left }: { left: TimeLeft | null }) {
  if (!left) return null;
  return (
    <div
      className={`tl-bar${left.over ? " is-over" : ""}`}
      data-tl-bar=""
      data-tl-over={left.over ? "true" : "false"}
      role="img"
      aria-label={timeLeftLine(left)}
    >
      <span className="tl-track" aria-hidden="true">
        <span
          className="tl-fill"
          style={{ width: `${Math.round(left.fill * 100)}%` }}
        />
      </span>
      <span className="tl-text">{timeLeftLine(left)}</span>
    </div>
  );
}
