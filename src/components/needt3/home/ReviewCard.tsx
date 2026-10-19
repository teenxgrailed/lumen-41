"use client";

import { Act, type ActionProps } from "./Act";

/**
 * THE WEEKLY REVIEW'S PROMPT. A card on Sundays ("Review your week"); the
 * review itself is the sheet behind it (`ha/HaReview`).
 */
export function ReviewCard({
  onStart,
  onLater,
  phone,
}: ActionProps & { onStart: () => void; onLater: () => void }) {
  return (
    <section className="nd-card" data-rv-card="" aria-label="Weekly review">
      <p className="nd-text">
        It&apos;s Sunday. Take two minutes to review the week.
      </p>
      <Act phone={phone} data-fin="review-start" onClick={onStart}>
        Review
      </Act>
      <button
        type="button"
        className="br-dismiss"
        data-rv="later"
        aria-label="Not now"
        onClick={onLater}
      >
        &times;
      </button>
    </section>
  );
}
