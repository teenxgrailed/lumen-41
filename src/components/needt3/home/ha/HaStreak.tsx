"use client";

import type { Streak } from "@/services/streak/streak";

const NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "2026-11-20" to its weekday name, read as a calendar date (no zone). */
const weekday = (key: string) =>
  NAMES[new Date(`${key}T00:00:00.000Z`).getUTCDay()] ?? "";

/**
 * A compact streak card: the number and "day streak", and the last seven days
 * as small circles. Done is a filled mark with a check, a missed day a faint
 * cross, today (still open) an outlined ring. Draws nothing until the numbers
 * are there. Not interactive.
 */
export function HaStreak({ streak }: { streak: Streak | null | undefined }) {
  if (!streak || !Array.isArray(streak.days)) return null;
  const { current, days, today } = streak;
  const label = `${current} day streak. Last seven days: ${days
    .map(
      (d) =>
        `${weekday(d.date)} ${d.done ? "done" : d.date === today ? "open" : "missed"}`
    )
    .join(", ")}`;
  return (
    <div
      className="ha-card ha-streak"
      data-ha-streak=""
      role="img"
      aria-label={label}
    >
      <div className="ha-streak-n">
        <b>{current}</b>
        <span>day streak</span>
      </div>
      <div className="ha-streak-days" aria-hidden>
        {days.map((d) => {
          const open = d.date === today && !d.done;
          return (
            <i
              key={d.date}
              className={`ha-streak-d${d.done ? " is-done" : open ? " is-today" : " is-missed"}`}
              data-ha-streak-day={d.done ? "done" : open ? "today" : "missed"}
            >
              {d.done ? (
                <svg viewBox="0 0 12 12" width="10" height="10">
                  <path
                    d="M2.5 6.4 5 8.8l4.5-5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : null}
            </i>
          );
        })}
      </div>
    </div>
  );
}
