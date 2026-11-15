"use client";

import { useEffect } from "react";

import { useFirstReplanHints } from "@/lib/needt3/hooks/first-replan";
import { useClearSample, useSampleStatus } from "@/lib/needt3/hooks/sample";

import { useFirstReplanGate } from "@/store/first-replan";

/**
 * Today's one-line reminder that what is on screen is a sample day, with the
 * single action that removes it. Draws nothing once there are no examples,
 * while the status is unknown, or if it could not be read. Desktop and phone
 * both use it; the row wraps, so the button drops under the words on a phone.
 * With the first-replan demo it waits its turn (one hint at a time) and gets a
 * close button; closing it moves on to the Sunday review.
 */
export function SampleBanner() {
  const status = useSampleStatus();
  const clear = useClearSample();
  const { current, goTo } = useFirstReplanHints();
  const dismissed = useFirstReplanGate((g) => g.bannerDismissed);
  const dismiss = useFirstReplanGate((g) => g.dismissBanner);
  const present = status.data?.present;
  const inSequence = current === "sample";
  // Cleared examples, or a banner that was closed: nothing left to show here.
  useEffect(() => {
    if (inSequence && (dismissed || present === false)) goTo("review");
  }, [inSequence, dismissed, present, goTo]);
  if (!present || (current !== null && !inSequence) || dismissed) return null;
  return (
    <div className="hd-sample" role="note" data-hd-sample="">
      <span className="hd-sample-text">
        <span className="hd-sample-title">This is a sample day</span>
        <span className="hd-sample-sub">
          Look around, change anything. Clear it when you want to start with
          your own.
        </span>
      </span>
      <button
        type="button"
        className="nx-btn nx-btn-secondary nx-btn-sm hd-sample-clear"
        data-hd-sample-clear=""
        disabled={clear.isPending}
        onClick={() => clear.mutate()}
      >
        {clear.isPending ? "Clearing…" : "Clear examples"}
      </button>
      {inSequence ? (
        <button
          type="button"
          className="br-dismiss"
          data-hd-sample-close=""
          aria-label="Close"
          onClick={() => {
            dismiss();
            goTo("review");
          }}
        >
          &times;
        </button>
      ) : null}
    </div>
  );
}
