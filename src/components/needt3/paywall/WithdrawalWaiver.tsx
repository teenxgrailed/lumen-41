"use client";

import { WITHDRAWAL_WAIVER_TERMS_HREF } from "@/lib/billing/withdrawal-waiver";

/**
 * The box every paid checkout asks first (Terms 5.5, see
 * src/lib/billing/withdrawal-waiver.ts): "Start Pro now. I understand I lose
 * the 14-day withdrawal right once it starts." Unchecked on every open, and
 * the screen keeps its buy button off until it is ticked. Worn like the
 * sign-up age box (`.auth-age`: 12px, the tick is ink, never the accent).
 */
export function WithdrawalWaiver({
  checked,
  onChange,
  product = "Pro",
  className = "auth-age",
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  /** What starts: "Pro", "Lifetime", or "my plan" where several are offered. */
  product?: string;
  className?: string;
}) {
  return (
    <label className={className} data-withdrawal-waiver="">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        Start {product} now. I understand I lose the 14-day withdrawal right
        once it starts.{" "}
        <a href={WITHDRAWAL_WAIVER_TERMS_HREF} target="_blank" rel="noreferrer">
          Terms
        </a>
      </span>
    </label>
  );
}
