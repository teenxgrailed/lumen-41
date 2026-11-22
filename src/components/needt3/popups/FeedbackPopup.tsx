"use client";

import { useEffect, useId, useState } from "react";

import { Glyph } from "../glyphs/Glyph";
import { PopupShell, rise } from "./PopupShell";
import {
  FEEDBACK_COPY,
  type FeedbackAnswer,
  type FeedbackKind,
  type FeedbackStep,
  type ReviewRoute,
  canSend,
  isScaleKind,
  scaleFor,
  stepAfterSend,
  toAnswer,
} from "./popup-model";

export interface FeedbackPopupProps {
  open: boolean;
  /** Closing at any step: the X, Escape, the scrim, a drag down, "Not now". */
  onClose: () => void;
  kind: FeedbackKind;
  /**
   * Called once, with the answer, when "Send" is pressed. Return a promise to
   * hold the popup on the question while it sends; a rejection keeps the answer
   * on screen and shows a retry line.
   */
  onSubmit: (answer: FeedbackAnswer) => void | Promise<void>;
  /**
   * Where a happy answer is asked for a review. `native` (iOS, Mac) calls
   * `onNativeReview`; `link` (web) opens the Product Hunt page. Null: no review step.
   */
  review?: ReviewRoute | null;
  /** The platform's own rating request. The popup closes after it. */
  onNativeReview?: () => void;
  /** The person went to the review link (for counting, never for the answer). */
  onReviewLink?: () => void;
  /** Start at a step other than the question (the lab and tests). */
  initialStep?: FeedbackStep;
  /** The answer behind the thanks and review steps when starting there. */
  initialAnswer?: FeedbackAnswer;
}

/**
 * One question, in one card, with a thanks and a review step after it.
 * rating: 1-5. nps: 0-10. wish / friction: a few words. A scale also takes an
 * optional reason. Only a 4-5 or a 9-10 is asked for a review (`stepAfterSend`).
 */
export function FeedbackPopup({
  open,
  onClose,
  kind,
  onSubmit,
  review = null,
  onNativeReview,
  onReviewLink,
  initialStep = "ask",
  initialAnswer,
}: FeedbackPopupProps) {
  const [step, setStep] = useState<FeedbackStep>(initialStep);
  const [score, setScore] = useState<number | null>(
    initialAnswer?.score ?? null
  );
  const [text, setText] = useState(initialAnswer?.text ?? "");
  const [answer, setAnswer] = useState<FeedbackAnswer | null>(
    initialAnswer ?? null
  );
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const fieldId = useId();
  const copy = FEEDBACK_COPY[kind];
  const scale = scaleFor(kind);
  const scaled = isScaleKind(kind);

  // A popup that opens again asks again, from the top.
  useEffect(() => {
    if (!open) return;
    setStep(initialStep);
    setScore(initialAnswer?.score ?? null);
    setText(initialAnswer?.text ?? "");
    setAnswer(initialAnswer ?? null);
    setFailed(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind]);

  const ready = canSend(kind, score, text) && !sending;

  const send = async () => {
    if (!ready) return;
    const a = toAnswer(kind, score, text);
    setSending(true);
    setFailed(false);
    try {
      await onSubmit(a);
      setAnswer(a);
      setStep(stepAfterSend(a, review));
    } catch {
      setFailed(true);
    } finally {
      setSending(false);
    }
  };

  if (step === "thanks") {
    return (
      <PopupShell
        open={open}
        onClose={onClose}
        title="Thank you"
        size="narrow"
        name="feedback-thanks"
        actions={
          <button
            type="button"
            className="pp-btn pp-btn-primary nx-press"
            onClick={onClose}
          >
            Done
          </button>
        }
      >
        <div className="pp-done" role="status">
          <span className="pp-check pp-rise" style={rise(0)} aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path
                d="M5 11.5l4 4 8-9"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <h2 className="pp-title px-display pp-rise" style={rise(1)}>
            Thank you
          </h2>
          <p className="pp-text pp-rise" style={rise(2)}>
            {answer?.kind === "wish" || answer?.kind === "friction"
              ? "It is written down, and it will be read."
              : "It is in, and it will be read."}
          </p>
        </div>
      </PopupShell>
    );
  }

  if (step === "review") {
    const route = review;
    return (
      <PopupShell
        open={open}
        onClose={onClose}
        title="Would you leave a review?"
        size="narrow"
        name="feedback-review"
        actions={
          <>
            {route?.kind === "link" ? (
              <a
                className="pp-btn pp-btn-primary nx-press"
                href={route.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  onReviewLink?.();
                  onClose();
                }}
              >
                {route.label}
              </a>
            ) : (
              <button
                type="button"
                className="pp-btn pp-btn-primary nx-press"
                onClick={() => {
                  onNativeReview?.();
                  onClose();
                }}
              >
                Rate Needt
              </button>
            )}
            <button
              type="button"
              className="pp-btn pp-btn-quiet nx-press"
              onClick={onClose}
            >
              Maybe later
            </button>
          </>
        }
      >
        <div className="pp-done">
          <span className="pp-check pp-rise" style={rise(0)} aria-hidden="true">
            <Glyph name="spark" size={22} />
          </span>
          <h2 className="pp-title px-display pp-rise" style={rise(1)}>
            Would you leave a review?
          </h2>
          <p className="pp-text pp-rise" style={rise(2)}>
            {route?.kind === "link"
              ? "A few words on Product Hunt help other people find Needt."
              : "A rating on the App Store helps other people find Needt."}
          </p>
        </div>
      </PopupShell>
    );
  }

  return (
    <PopupShell
      open={open}
      onClose={onClose}
      title={copy.title}
      size="narrow"
      name={"feedback-" + kind}
      actions={
        <>
          <button
            type="button"
            className="pp-btn pp-btn-primary nx-press"
            disabled={!ready}
            onClick={send}
          >
            {sending ? "Sending…" : copy.send}
          </button>
          <button
            type="button"
            className="pp-btn pp-btn-quiet nx-press"
            onClick={onClose}
          >
            Not now
          </button>
        </>
      }
    >
      <h2 className="pp-title pp-title-sm px-display pp-rise" style={rise(0)}>
        {copy.title}
      </h2>
      <p className="pp-text pp-rise" style={rise(1)}>
        {copy.hint}
      </p>
      {scaled ? (
        <div className="pp-rise" style={rise(2)}>
          <div
            className="pp-scale"
            role="radiogroup"
            aria-label={copy.title}
            data-pp-points={scale.length}
          >
            {scale.map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={score === n}
                className="pp-pt nx-press"
                data-on={score === n ? "" : undefined}
                onClick={() => {
                  setScore(n);
                  setFailed(false);
                }}
              >
                {n}
              </button>
            ))}
          </div>
          {copy.ends ? (
            <div className="pp-ends" aria-hidden="true">
              <span>{copy.ends[0]}</span>
              <span>{copy.ends[1]}</span>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="pp-rise" style={rise(scaled ? 3 : 2)}>
        <label className="pp-sr" htmlFor={fieldId}>
          {copy.title}
        </label>
        <textarea
          id={fieldId}
          className="pp-field"
          rows={scaled ? 3 : 5}
          maxLength={2000}
          value={text}
          placeholder={copy.placeholder}
          onChange={(e) => {
            setText(e.target.value);
            setFailed(false);
          }}
        />
      </div>
      {failed ? (
        <p className="pp-fail" role="alert">
          It did not send. Your answer is still here; try again.
        </p>
      ) : null}
    </PopupShell>
  );
}
