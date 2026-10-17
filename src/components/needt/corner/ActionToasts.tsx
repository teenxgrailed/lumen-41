"use client";

/* ACTION TOASTS — what you just did, as a compact pill at the bottom centre.
 *
 * "Focus started · 25 min on “Renew the domain”", "Placed at 14:00 · 3 Sep
 * [Undo]". The owner's mockups put these in the bottom centre, inverted
 * against the page: a near-black pill with white text on Light, a white pill
 * with dark text on Dark. The inversion is not a colour choice made here; it
 * is the design's own `--text-primary` fill and `--background` ink (the
 * prototype's `ToastLayer`), which swap with the resolved theme, Time
 * included, so there is no second palette to keep in step.
 *
 * This is the transient surface only. The growing island in the Ask Needt
 * corner (PORT.md §6) is untouched and still carries the product's own
 * nudges: a notice names its surface (`NoticePayload.surface`), `toast` by
 * default, and this draws every one that did not ask for the island.
 *
 * The stack arithmetic (fold, drop past four, the dismiss clock that hover
 * holds) is `./stack` and the state is `./notices`, the same as the island's;
 * this host owns a provider of its own so the two surfaces never share a
 * clock or a cap.
 */
import * as React from "react";

import { setNoticeSink } from "./bridge";
import { NeedtNoticeProvider, useNoticeStack, useNotify } from "./notices";
import { foldAt, shown } from "./stack";
import type { Notice, NoticeAct } from "./types";

/** Hands the mounted stack to the plain-function facade, and takes it back. */
function Sink() {
  const api = useNotify();
  React.useEffect(() => {
    setNoticeSink(api, "toast");
    return () => setNoticeSink(null, "toast");
  }, [api]);
  return null;
}

/** "Title · body": the mockup reads as one line. */
export function toastLine(notice: Pick<Notice, "title" | "body">): string {
  return notice.body ? `${notice.title} · ${notice.body}` : notice.title;
}

function Toast({
  notice,
  depth,
  onAct,
  onClose,
}: {
  notice: Notice;
  depth: number;
  onAct: (notice: Notice, act: NoticeAct) => void;
  onClose: (id: string) => void;
}) {
  const fold = foldAt(depth);
  const act = notice.acts && notice.acts.length ? notice.acts[0] : null;
  return (
    <div
      className={`nx-action-toast${notice.leaving ? " is-out" : ""}`}
      data-toast-kind={notice.kind}
      style={{
        order: -depth,
        transform: `scale(${fold.scale})`,
        opacity: fold.opacity,
        pointerEvents: fold.interactive ? "auto" : "none",
      }}
    >
      {notice.kind === "risk" || notice.kind === "blocked" ? (
        <span className="nx-action-toast-mark" aria-hidden="true" />
      ) : null}
      <span className="nx-action-toast-text">{toastLine(notice)}</span>
      {act ? (
        <button
          type="button"
          className="nx-action-toast-act"
          onClick={() => onAct(notice, act)}
        >
          {act.label}
        </button>
      ) : null}
      <button
        type="button"
        className="nx-action-toast-x"
        aria-label="Dismiss notification"
        onClick={() => onClose(notice.id)}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" />
        </svg>
      </button>
    </div>
  );
}

export function ActionToastStack() {
  const { notices, hold, release } = useNoticeStack();
  const { dismiss } = useNotify();

  function act(notice: Notice, action: NoticeAct) {
    dismiss(notice.id);
    action.run?.();
  }

  if (!notices.length) return null;

  const cards = shown(notices);
  /* A failure has to interrupt; everything else can wait for a pause. */
  const urgent = cards.some((n) => n.kind === "risk" || n.kind === "blocked");

  return (
    <div
      className="nx-action-toasts"
      /* The companion keeps clear of this; a pill it sat on top of could not
         be read or dismissed. */
      data-assistant-avoid
      role="region"
      aria-label="Needt action notices"
      aria-live={urgent ? "assertive" : "polite"}
      aria-atomic="false"
      /* Hovering or focusing stops the dismiss clock: reaching for Undo is
         the clearest possible statement that you are not finished with it. */
      onMouseEnter={hold}
      onMouseLeave={release}
      onFocus={hold}
      onBlur={(e) => {
        const next = e.relatedTarget;
        if (!(next instanceof Node && e.currentTarget.contains(next))) {
          release();
        }
      }}
    >
      {cards.map((notice, i) => (
        <Toast
          key={notice.id}
          notice={notice}
          depth={cards.length - 1 - i}
          onAct={act}
          onClose={dismiss}
        />
      ))}
    </div>
  );
}

/**
 * Mounted once per frame, inside the scope that resolves the design's tokens
 * (`.needt-v3` in the v3 frame, `.needt-v2` in the older shell).
 */
export function ActionToasts() {
  return (
    <NeedtNoticeProvider>
      <Sink />
      <ActionToastStack />
    </NeedtNoticeProvider>
  );
}
