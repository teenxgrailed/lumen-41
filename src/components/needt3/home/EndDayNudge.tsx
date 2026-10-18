"use client";

import { LuX } from "react-icons/lu";

import { Act, type ActionProps } from "./Act";

/**
 * A gentle prompt, one line, in the last half hour of the working day: End day.
 * Dismissible; drawn only when asked to be.
 */
export function EndDayNudge({
  onEndDay,
  onDismiss,
  phone,
}: ActionProps & { onEndDay: () => void; onDismiss: () => void }) {
  return (
    <section className="nd-card" data-nd-card="" aria-label="End of day">
      <p className="nd-text">
        Wrapping up? End the day and leave a note for tomorrow.
      </p>
      <Act phone={phone} data-fin="nudge-end-day" onClick={onEndDay}>
        End day
      </Act>
      <button
        type="button"
        className="br-dismiss"
        data-nd="dismiss"
        aria-label="Not now"
        onClick={onDismiss}
      >
        <LuX size={14} aria-hidden />
      </button>
    </section>
  );
}
