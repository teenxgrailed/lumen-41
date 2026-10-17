"use client";

import { useClearSample, useSampleStatus } from "@/lib/needt3/hooks/sample";

/**
 * Today's one-line reminder that what is on screen is a sample day, with the
 * single action that removes it. Draws nothing once there are no examples,
 * while the status is unknown, or if it could not be read. Desktop and phone
 * both use it; the row wraps, so the button drops under the words on a phone.
 */
export function SampleBanner() {
  const status = useSampleStatus();
  const clear = useClearSample();
  if (!status.data?.present) return null;
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
    </div>
  );
}
