"use client";

import { useEffect, useRef, useState } from "react";

import { HaG, HaI, haCx } from "./ui";

export interface HaHabit {
  id: string;
  name: string;
  /** The habit's emoji; empty draws the habits glyph. */
  emoji: string;
  /** "week": N times a week, with a count ring; "daily": once a day. */
  kind: "daily" | "week";
  target?: number;
  /** Times kept this week (weekly habits). */
  count?: number;
  /** Kept today. */
  done: boolean;
}

function Ring({ count, target }: { count: number; target: number }) {
  const r = 15;
  const L = 2 * Math.PI * r;
  const p = target > 0 ? Math.min(1, count / target) : 0;
  return (
    <svg className="ha-hab-ring" viewBox="0 0 34 34">
      <circle className="bg" cx="17" cy="17" r={r} />
      <circle
        className="fg"
        cx="17"
        cy="17"
        r={r}
        strokeDasharray={L}
        strokeDashoffset={L * (1 - p)}
      />
    </svg>
  );
}

/**
 * 1 - the habits row. Pills with the emoji (or the habits glyph), the name and
 * N/target for weekly habits with a count ring; a tap keeps today (or takes it
 * back). Scrolls sideways when there are many; draws nothing without habits.
 * The state is the caller's: `onToggle` writes, the list comes back changed.
 */
export function HaHabits({
  habits,
  onToggle,
  onAdd,
}: {
  habits: readonly HaHabit[];
  onToggle?: (id: string, done: boolean) => void;
  /** Desktop: a dashed "+" that starts a new habit. */
  onAdd?: () => void;
}) {
  const [just, setJust] = useState<string | null>(null);
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  if (!habits.length) return null;
  return (
    <div className="ha-habits" role="group" aria-label="Habits today">
      {habits.map((h) => {
        const weekly = h.kind === "week" && !!h.target;
        const label =
          h.name +
          (weekly ? `, ${h.count ?? 0} of ${h.target} this week` : "") +
          (h.done ? ", done today" : "");
        return (
          <button
            key={h.id}
            type="button"
            className={haCx(
              "ha-hab",
              h.done && "is-done",
              just === h.id && "just"
            )}
            aria-pressed={h.done}
            aria-label={label}
            data-ha-habit={h.id}
            onClick={() => {
              setJust(h.id);
              window.clearTimeout(timer.current);
              timer.current = window.setTimeout(() => setJust(null), 380);
              onToggle?.(h.id, !h.done);
            }}
          >
            <span className="ha-hab-ic">
              {h.done ? (
                <span className="ha-hab-check">
                  <HaI n="check" s={16} />
                </span>
              ) : h.emoji ? (
                h.emoji
              ) : (
                <HaG name="habits" size={18} />
              )}
              {weekly ? (
                <Ring count={h.count ?? 0} target={h.target ?? 1} />
              ) : null}
            </span>
            {h.name}
            {weekly ? (
              <span className="ha-hab-n">
                {h.count ?? 0}/{h.target}
              </span>
            ) : null}
          </button>
        );
      })}
      {onAdd ? (
        <button
          type="button"
          className="ha-habits-add"
          aria-label="New habit"
          onClick={onAdd}
        >
          <HaI n="plus" s={14} />
        </button>
      ) : null}
    </div>
  );
}
