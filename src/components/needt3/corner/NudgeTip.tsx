"use client";

/* THE TIP — what the nudge job noticed, said above the Ask pill (prototype
 * Chat.jsx `ChatTip`): a small painted-sky card, right-aligned with the pill,
 * two cloud puffs trailing down to it. It is the pill's own corner speaking,
 * not a toast: the pill never changes size and stays clickable under it.
 * Hovering or focusing the card holds its dismiss clock.
 */
import * as React from "react";

import { LuX } from "react-icons/lu";

import { PxSky } from "../scenes";
import type { TipNote } from "./nudge-tip";

/** Single letters and modifier glyphs in the title are drawn as keys. */
const KEY_RE = /^(?:[A-Z]|⌘|⌥|⇧|⌃|Esc|Tab|↵|\/)$/;

function Title({ text }: { text: string }) {
  return (
    <>
      {text.split(" ").map((w, i) => (
        <React.Fragment key={i}>
          {i ? " " : null}
          {KEY_RE.test(w) ? <kbd className="chat-tip-kbd">{w}</kbd> : w}
        </React.Fragment>
      ))}
    </>
  );
}

export interface NudgeTipProps {
  note: TipNote;
  leaving: boolean;
  onOpen: () => void;
  onAct: () => void;
  onDismiss: () => void;
  onHold: (held: boolean) => void;
}

export const NudgeTip = React.forwardRef<HTMLDivElement, NudgeTipProps>(
  function NudgeTip({ note, leaving, onOpen, onAct, onDismiss, onHold }, ref) {
    /* The sky is absolutely positioned, so a hidden copy of the words sits in
       flow to give the card its height (one or two lines of body). */
    const inner = (live: boolean) => (
      <span className="chat-tip-in">
        <span className="chat-tip-title">
          <Title text={note.title} />
        </span>
        <span className="chat-tip-line">{note.body}</span>
        <span className="chat-tip-acts">
          <button
            type="button"
            className="px-chip-btn chat-tip-act"
            tabIndex={live ? 0 : -1}
            data-chat-tip-act={live ? "" : undefined}
            onClick={
              live
                ? (e) => {
                    e.stopPropagation();
                    onAct();
                  }
                : undefined
            }
          >
            {note.act.label}
          </button>
        </span>
      </span>
    );
    return (
      <div
        ref={ref}
        className={`chat-tip-anchor${leaving ? " is-leaving" : ""}`}
        data-chat-tip-anchor
      >
        <div
          className={`chat-tip${leaving ? " is-leaving" : ""}`}
          data-chat-tip={note.type}
          role="status"
          aria-live="polite"
          onMouseEnter={() => onHold(true)}
          onMouseLeave={() => onHold(false)}
          onFocus={() => onHold(true)}
          onBlur={() => onHold(false)}
        >
          <div
            className="chat-tip-card nx-focus"
            data-px-scope
            role="button"
            tabIndex={0}
            aria-label={`${note.title}. ${note.body} Open Ask Needt`}
            onClick={onOpen}
            onKeyDown={(e) => {
              if (
                e.target === e.currentTarget &&
                (e.key === "Enter" || e.key === " ")
              ) {
                e.preventDefault();
                onOpen();
              }
            }}
          >
            <span className="chat-tip-sizer" aria-hidden="true">
              {inner(false)}
            </span>
            <PxSky variant="d" intensity={0.9} scene="promo" horizon="none">
              <span className="chat-tip-glow" aria-hidden="true" />
              {inner(true)}
              <button
                type="button"
                className="px-chip-btn chat-tip-x"
                aria-label="Dismiss"
                data-chat-tip-close
                onClick={(e) => {
                  e.stopPropagation();
                  onDismiss();
                }}
              >
                <LuX size={12} />
              </button>
            </PxSky>
          </div>
          <span className="chat-tip-puff is-1" aria-hidden="true" />
          <span className="chat-tip-puff is-2" aria-hidden="true" />
        </div>
      </div>
    );
  }
);
