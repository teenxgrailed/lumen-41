"use client";

import { NEEDT_PRICING } from "@/lib/creem/config";

import type { PlanChoice } from "./auth-redo";

/** The plan that was picked, as one quiet row inside the card above the email:
    "Pro · $59/year · 14 days free" and the way out ("Start with {NEEDT_PRICING.trialDays} days free").
    A card in the card (the usage card of the Craft reference), not a chip. */
export function PlanChip({
  plan,
  onFree,
}: {
  plan: PlanChoice;
  onFree: () => void;
}) {
  return (
    <div className="ac-plan" data-auth-plan={plan.id}>
      <p className="ac-plan-line">
        <b>{plan.name}</b>
        <span aria-hidden="true">·</span>
        <span>{plan.price}</span>
      </p>
      <button
        type="button"
        className="ax-link ac-plan-free"
        data-auth-plan-free
        onClick={onFree}
      >
        Start with {NEEDT_PRICING.trialDays} days free
      </button>
    </div>
  );
}
