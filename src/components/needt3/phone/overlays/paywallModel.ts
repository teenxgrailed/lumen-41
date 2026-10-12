/**
 * The phone paywall's words and numbers, pure.
 *
 * The phone sheet sells exactly what the desktop paywall sells: the call to
 * action, its disabled state and the "blocked" line come from `paywallCta`
 * (`@/lib/needt3/paywall`), which honours the server's `billing_checkout`
 * switch and stays off while the plan is loading; the feature lists come from
 * `freeIncludes()` / `proIncludes()` (built from `PLAN_LIMITS`, the numbers the
 * server enforces); the Lifetime counter is `plan.lifetimeLeft`. Prices come
 * from `priceStrings()` (`@/lib/needt3/pricing`, i.e. `NEEDT_PRICING`). No
 * number, price or seat count is spelled here.
 */
import type { BillingCheckoutSelection } from "@/lib/creem/config";
import type { V3Plan } from "@/lib/needt3/hooks/plan";
import {
  type PaywallCta,
  type PaywallPick,
  checkoutSelection,
  freeIncludes,
  lifetimeLeftPct,
  paywallCta,
  paywallPick,
} from "@/lib/needt3/paywall";
import { lifetimeLeftLine, priceStrings } from "@/lib/needt3/pricing";

/* ---------- the sheet ---------- */

/** The cards: Pro (monthly or yearly, one card with a switch) and Lifetime. */
export type PwPick = PaywallPick;

/** A cycle name from outside ("monthly" | "annual" | "yearly" | "lifetime") → a pick. */
export function pickOf(cycle: string | null | undefined): PwPick {
  return paywallPick(cycle);
}

/** What `POST /api/billing/checkout` takes for a pick. */
export function checkoutBody(pick: PwPick): BillingCheckoutSelection {
  return checkoutSelection(pick);
}

/** The slice of `GET /api/billing` the sheet reads. */
export type PwPlan = Pick<V3Plan, "kind" | "configured" | "lifetimeAvailable"> &
  Partial<Pick<V3Plan, "checkoutEnabled" | "lifetimeLeft">>;

/** "Tasks and projects, docs, 1 calendar, ..." from the Free limits. */
export function freeSummary(lines: readonly string[] = freeIncludes()) {
  const s = lines.join(", ").toLowerCase();
  return s.replace(/^./, (c) => c.toUpperCase());
}

export interface PwView {
  cta: PaywallCta;
  /** The plan has not loaded: the button stays off until it has. */
  loading: boolean;
  /** "Current plan" while on Free (or unknown), "Included" on any paid plan. */
  freeTag: "Current plan" | "Included";
  /** "N of 300 left" from the server's count, or "First 300 buyers". */
  lifetimeLine: string;
  /** The meter's fill, 0-100; null when the server has not counted. */
  lifetimePct: number | null;
}

/** Everything the sheet shows that depends on the plan and the pick. */
export function pwView(
  pick: PwPick,
  plan: PwPlan | null | undefined,
  cap: number = priceStrings().lifetimeCap
): PwView {
  return {
    cta: paywallCta(pick, plan ?? null),
    loading: !plan,
    freeTag: !plan || plan.kind === "free" ? "Current plan" : "Included",
    lifetimeLine: lifetimeLeftLine(plan?.lifetimeLeft, cap),
    lifetimePct: lifetimeLeftPct(plan?.lifetimeLeft),
  };
}

/** The button is off while offline, loading, blocked or already opening. */
export function pwDisabled(
  view: Pick<PwView, "cta" | "loading">,
  { online, busy }: { online: boolean; busy: boolean }
): boolean {
  return !online || busy || view.loading || view.cta.blocked !== null;
}
