"use client";

import { useEffect, useState } from "react";

import {
  type FeedbackKind,
  QUESTIONS,
  type ReviewChannel,
  canSend,
} from "@/lib/feedback/prompt";
import { requestNativeReview } from "@/lib/native-store";

import { PkButton } from "../phone/kit";
import type { FeedbackAnswer } from "./use-feedback-prompt";

export type FeedbackStep = "ask" | "review" | "thanks";

const RATINGS = [1, 2, 3, 4, 5] as const;
const SCORES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
const TEXT_MAX = 2000;
/** The thank-you closes itself after this long. */
const THANKS_MS = 2600;

/** A button in the style of the UI it sits in: the phone kit's or the desktop's. */
function Btn({
  phone,
  primary,
  pressed,
  disabled,
  small,
  onClick,
  children,
  ...data
}: {
  phone: boolean;
  primary?: boolean;
  pressed?: boolean;
  disabled?: boolean;
  small?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  "data-fbk-value"?: number;
}) {
  if (phone)
    return (
      <PkButton
        kind={primary ? "primary" : "quiet"}
        small={small}
        disabled={disabled}
        aria-pressed={pressed}
        onClick={onClick}
        {...data}
      >
        {children}
      </PkButton>
    );
  return (
    <button
      type="button"
      className={
        "nx-btn nx-btn-sm " + (primary ? "nx-btn-primary" : "nx-btn-secondary")
      }
      disabled={disabled}
      aria-pressed={pressed}
      onClick={onClick}
      {...data}
    >
      {children}
    </button>
  );
}

/**
 * What is inside the popup: one question, an optional text field, and for a
 * 5 or an NPS of 9 or 10 the second step "Leave a review?". Layout only; the
 * sheet around it is the app's own (the desktop Sheet, the phone PkSheet).
 */
export function FeedbackBody({
  kind,
  step,
  phone,
  channel,
  onSend,
  onSkip,
  onDone,
}: {
  kind: FeedbackKind;
  step: FeedbackStep;
  phone: boolean;
  channel: ReviewChannel;
  onSend: (answer: FeedbackAnswer) => Promise<void>;
  onSkip: () => void;
  onDone: () => void;
}) {
  const q = QUESTIONS[kind];
  const [rating, setRating] = useState<number | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (step !== "thanks") return;
    const id = window.setTimeout(onDone, THANKS_MS);
    return () => window.clearTimeout(id);
  }, [step, onDone]);

  const submit = async () => {
    setBusy(true);
    try {
      await onSend({
        ...(kind === "rating" && rating !== null ? { rating } : {}),
        ...(kind === "nps" && score !== null ? { score } : {}),
        ...(text.trim() ? { text: text.trim() } : {}),
      });
    } finally {
      setBusy(false);
    }
  };

  const review = async () => {
    if (channel?.kind === "native") await requestNativeReview();
    else if (channel?.kind === "link")
      window.open(channel.url, "_blank", "noopener,noreferrer");
    onDone();
  };

  if (step === "thanks")
    return (
      <div className="fbk" data-feedback-prompt="" data-fbk-step="thanks">
        <p className="base-strong">Thank you.</p>
        <p className="base-meta-muted">
          It reaches the people who build Needt.
        </p>
        <div className="fbk-actions">
          <Btn phone={phone} onClick={onDone}>
            Close
          </Btn>
        </div>
      </div>
    );

  if (step === "review")
    return (
      <div className="fbk" data-feedback-prompt="" data-fbk-step="review">
        <p className="base-strong">Glad it works for you.</p>
        <p className="base-meta-muted">
          Leave a review? It helps other people find Needt.
        </p>
        <div className="fbk-actions">
          <Btn phone={phone} onClick={onDone}>
            Not now
          </Btn>
          <Btn phone={phone} primary onClick={() => void review()}>
            Leave a review
          </Btn>
        </div>
      </div>
    );

  const values = kind === "rating" ? RATINGS : kind === "nps" ? SCORES : null;
  const picked = kind === "rating" ? rating : score;
  return (
    <div className="fbk" data-feedback-prompt="" data-fbk-step="ask">
      <p className="base-strong" data-fbk-question={kind}>
        {q.title}
      </p>
      {values ? (
        <div className="fbk-scale">
          <div
            className="fbk-values"
            role="group"
            aria-label={q.title}
            data-fbk-count={values.length}
          >
            {values.map((n) => (
              <Btn
                key={n}
                phone={phone}
                small
                pressed={picked === n}
                data-fbk-value={n}
                onClick={() => (kind === "rating" ? setRating(n) : setScore(n))}
              >
                {String(n)}
              </Btn>
            ))}
          </div>
          <div className="fbk-ends base-meta-muted">
            <span>{kind === "rating" ? "Poor" : "Not likely"}</span>
            <span>{kind === "rating" ? "Great" : "Very likely"}</span>
          </div>
        </div>
      ) : null}
      <label className="fbk-field">
        <span className="base-label">{q.textLabel}</span>
        <textarea
          className="shell-bug-sheet-textarea"
          rows={q.textRequired ? 4 : 2}
          maxLength={TEXT_MAX}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <div className="fbk-actions">
        <Btn phone={phone} onClick={onSkip}>
          Not now
        </Btn>
        <Btn
          phone={phone}
          primary
          disabled={busy || !canSend(kind, { rating, score, text })}
          onClick={() => void submit()}
        >
          Send
        </Btn>
      </div>
    </div>
  );
}
