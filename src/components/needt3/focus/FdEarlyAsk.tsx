"use client";

import { fullTimeAskLine } from "@/lib/needt3/full-time";

import * as copy from "./strings";

/** The ring: time left as an arc (the accent is the mark), minutes inside. */
export function FdRing({
  left,
  total,
  size,
  stroke,
}: {
  left: number;
  total: number;
  size: number;
  stroke: number;
}) {
  const r = (size - stroke) / 2;
  const len = 2 * Math.PI * r;
  const share = total > 0 ? Math.min(1, Math.max(0, left / total)) : 0;
  return (
    <span className="fd-ring" style={{ width: size, height: size }}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        aria-hidden="true"
      >
        <circle
          className="bg"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
        />
        <circle
          className="fg"
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          strokeDasharray={len}
          strokeDashoffset={len * (1 - share)}
        />
      </svg>
      <em>{left}</em>
    </span>
  );
}

/**
 * A full-time task was ticked with focus time left: one small choice.
 * Keep going is the primary; End now is the normal early finish (the toast
 * and the green slice on Home's time-left bar follow).
 */
export function FdEarlyAsk({
  title,
  leftMin,
  plannedMin,
  onKeep,
  onEnd,
}: {
  title: string;
  leftMin: number;
  plannedMin: number | null;
  onKeep: () => void;
  onEnd: () => void;
}) {
  return (
    <div
      className="fd-ask fd-desk"
      data-fc-full-time-ask=""
      role="alertdialog"
      aria-label={fullTimeAskLine(leftMin)}
    >
      <div className="h">
        <FdRing
          left={leftMin}
          total={plannedMin ?? leftMin}
          size={44}
          stroke={3.5}
        />
        <div>
          <b>{fullTimeAskLine(leftMin)}</b>
          <span>{copy.fullTimeAskSub(title, plannedMin)}</span>
        </div>
      </div>
      <div className="acts">
        <button
          type="button"
          className="fd-btn is-primary"
          onClick={onKeep}
          data-fc-full-time-keep=""
        >
          {copy.keepGoing}
        </button>
        <button
          type="button"
          className="fd-btn"
          onClick={onEnd}
          data-fc-full-time-end=""
        >
          {copy.endNow}
        </button>
      </div>
    </div>
  );
}
