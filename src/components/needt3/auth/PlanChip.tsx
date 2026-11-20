"use client";

import { PRO_ADDS } from "@/components/onboarding/ob3-steps";

import type { PlanChoice } from "./auth-redo";

/** Variant A's top of card: the plan that was picked, what it adds, and the
    way out ("Start free instead"). The three lines are the first of
    `PRO_ADDS`, the same list the pricing page shows. */
export function PlanChip({
  plan,
  onFree,
  className = "auth-plan",
}: {
  plan: PlanChoice;
  onFree: () => void;
  className?: string;
}) {
  return (
    <div className={className} data-auth-plan={plan.id}>
      <div className="auth-plan-head">
        <span className="auth-plan-chip">
          <b>{plan.name}</b>
          <span aria-hidden="true">·</span>
          <span>{plan.price}</span>
        </span>
        <button
          type="button"
          className="ax-link auth-plan-free"
          data-auth-plan-free
          onClick={onFree}
        >
          Start free instead
        </button>
      </div>
      <p className="auth-plan-note">{plan.note}</p>
      <ul className="auth-plan-list">
        {PRO_ADDS.slice(0, 3).map(([key, title]) => (
          <li key={key}>{title}</li>
        ))}
      </ul>
    </div>
  );
}
