"use client";

import { LuSunrise, LuX } from "react-icons/lu";

/**
 * THE MORNING BRIEF. Two or three lines from Ask at the top of Home in the
 * morning, dismissible. Drawn only when there is a brief; no upsell, no empty
 * state, nothing for a person who cannot have one.
 */
export function BriefCard({
  text,
  onDismiss,
}: {
  text: string;
  onDismiss: () => void;
}) {
  const lines = text.split("\n").filter(Boolean);
  if (!lines.length) return null;
  return (
    <section
      className="br-card"
      data-br-card=""
      aria-label="Morning brief"
      aria-live="polite"
    >
      <span className="br-icon" aria-hidden="true">
        <LuSunrise size={14} />
      </span>
      <div className="br-lines">
        {lines.map((l, i) => (
          <p key={i} className="br-line">
            {l}
          </p>
        ))}
      </div>
      <button
        type="button"
        className="br-dismiss"
        data-br="dismiss"
        aria-label="Dismiss the morning brief"
        onClick={onDismiss}
      >
        <LuX size={14} aria-hidden />
      </button>
    </section>
  );
}
