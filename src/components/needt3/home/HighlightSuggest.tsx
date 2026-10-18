"use client";

import { LuStar, LuX } from "react-icons/lu";

import { Act, type ActionProps } from "./Act";

/**
 * "Make this your highlight?" One line in the morning with the best candidate:
 * one tap accepts, another asks for a different one.
 */
export function HighlightSuggest({
  title,
  meta,
  canCycle,
  onAccept,
  onAnother,
  onDismiss,
  phone,
}: ActionProps & {
  title: string;
  meta: string;
  canCycle: boolean;
  onAccept: () => void;
  onAnother: () => void;
  onDismiss: () => void;
}) {
  return (
    <section
      className="hs-suggest"
      data-hl-suggest=""
      aria-label="Suggested highlight"
    >
      <span className="br-icon" aria-hidden="true">
        <LuStar size={14} />
      </span>
      <span className="hs-suggest-text">
        <span className="hs-suggest-title">{title}</span>
        <span className="fin-pick-meta">
          {meta ? `${meta} · ` : ""}Make it today&apos;s highlight?
        </span>
      </span>
      <Act phone={phone} data-fin="suggest-accept" onClick={onAccept}>
        Yes
      </Act>
      {canCycle ? (
        <Act phone={phone} data-fin="suggest-another" onClick={onAnother}>
          Another
        </Act>
      ) : null}
      <button
        type="button"
        className="br-dismiss"
        data-hl-suggest-dismiss=""
        aria-label="Not now"
        onClick={onDismiss}
      >
        <LuX size={14} aria-hidden />
      </button>
    </section>
  );
}
