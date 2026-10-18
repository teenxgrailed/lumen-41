"use client";

import { LuStar, LuX } from "react-icons/lu";

import { Act, type ActionProps } from "./Act";

/**
 * TODAY'S HIGHLIGHT. The one task picked as the main thing of the day, big at
 * the top of Home, with a one-tap complete and Start focus. Drawn only when a
 * highlight is set; a finished one is a single quiet line.
 */
export function HighlightCard({
  id,
  title,
  meta,
  done,
  onComplete,
  onFocus,
  onClear,
  onOpen,
  phone,
}: ActionProps & {
  id: string;
  title: string;
  meta: string;
  done: boolean;
  onComplete: () => void;
  onFocus: () => void;
  onClear: () => void;
  onOpen: () => void;
}) {
  return (
    <section
      className={`hl-card${done ? " is-done" : ""}`}
      data-hl-card={id}
      data-hl-done={done ? "true" : "false"}
      aria-label="Today’s highlight"
    >
      <div className="hl-top">
        <span className="hl-eyebrow">
          <LuStar size={12} aria-hidden /> Highlight
        </span>
        <button
          type="button"
          className="hl-clear"
          aria-label="Remove highlight"
          data-hl="clear"
          onClick={onClear}
        >
          <LuX size={14} aria-hidden />
        </button>
      </div>
      <button type="button" className="hl-title" onClick={onOpen}>
        {title}
      </button>
      {meta ? <p className="hl-meta">{meta}</p> : null}
      {done ? null : (
        <div className="hl-acts">
          <Act phone={phone} data-fin="hl-complete" onClick={onComplete}>
            Complete
          </Act>
          <Act phone={phone} data-fin="hl-focus" onClick={onFocus}>
            Start focus
          </Act>
        </div>
      )}
    </section>
  );
}
