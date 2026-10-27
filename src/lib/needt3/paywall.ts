/**
 * Paywall logic: which plan is picked, what the call to action says, what a
 * plan is called. Pure. Every number and price string comes from the one
 * module (`NEEDT_PRICING` via `priceStrings` in ./pricing); "N of 300 left" is
 * the server's count (`GET /api/billing` -> `lifetimeLeft`), never a constant.
 */
import { PLAN_LIMITS, type PlanLimits } from "@/lib/plan-limits";

import type { V3Plan } from "./hooks/plan";
import { priceStrings } from "./pricing";

const PRICE = priceStrings();
const PRICE_CAP = PRICE.lifetimeCap;

/** The meter's fill, 0-100, or null when the server has not counted. */
export function lifetimeLeftPct(
  left: number | null | undefined
): number | null {
  if (left == null || !Number.isFinite(left)) return null;
  const n = Math.max(0, Math.min(PRICE_CAP, Math.floor(left)));
  return Math.round((n / PRICE_CAP) * 100);
}

/** The paywall's plan picks: "monthly" | "annual" (Pro yearly) | "lifetime". */
const TRIAL_AFTER =
  "When the trial ends you go back to Free unless you choose a plan — we’ll remind you 3 days before.";

export type PaywallPick = "monthly" | "annual" | "lifetime";

export function paywallPick(value: unknown): PaywallPick {
  return value === "monthly" || value === "lifetime" ? value : "annual";
}

/** What a pick sends to `POST /api/billing/checkout`. */
export function checkoutSelection(pick: PaywallPick) {
  if (pick === "lifetime") return { plan: "lifetime" as const };
  return {
    plan: "pro" as const,
    interval: pick === "monthly" ? ("month" as const) : ("year" as const),
  };
}

export interface PaywallCta {
  label: string;
  sub: string;
  /** Why the button is off, shown in place of `sub`; null when it works. */
  blocked: string | null;
  /**
   * What the button does: `trial` starts the free trial (no card, no
   * payment), `checkout` goes to the payment provider.
   */
  action: "trial" | "checkout";
}

type PlanFacts =
  | (Pick<V3Plan, "kind" | "configured" | "lifetimeAvailable"> &
      Partial<Pick<V3Plan, "checkoutEnabled" | "trialEligible">>)
  | null;

/**
 * The call to action under the plan cards.
 *
 * The prototype's button started the trial on the spot. Here the server
 * grants the trial when the email is confirmed, so most people are already in
 * it or past it. Someone on Free whom the server says can still have one
 * (`trialEligible`) gets "Start 14-day free trial" for either Pro card, and it
 * starts the trial: no card, no payment, so it works while checkout is closed.
 * Everyone else's Pro buttons go to checkout and say so. Payments that are
 * not configured turn the button off and say why; nothing pretends to
 * succeed.
 */
export function paywallCta(pick: PaywallPick, plan: PlanFacts): PaywallCta {
  const kind = plan?.kind ?? "free";
  const owned =
    (pick === "lifetime" && kind === "lifetime") ||
    (pick !== "lifetime" &&
      (kind === "monthly" || kind === "yearly") &&
      plan !== null);
  /* "No card needed" is true only of the trial; a checkout takes a card. */
  const paidSub = offersTrial(plan) ? PRICE.trialShort : PRICE.paidShort;
  const base: Omit<PaywallCta, "blocked" | "action"> =
    pick === "lifetime"
      ? {
          label: `Get Lifetime · ${PRICE.lifetime}`,
          sub: "One payment · Pro for good",
        }
      : pick === "monthly"
        ? {
            label: `Choose Pro · ${PRICE.monthly} / month`,
            sub: kind === "trial" ? TRIAL_AFTER : paidSub,
          }
        : {
            label: `Choose Pro · ${PRICE.yearly} / year`,
            sub: kind === "trial" ? TRIAL_AFTER : paidSub,
          };

  if (kind === "lifetime") {
    return {
      ...base,
      label: "Lifetime is yours",
      blocked: "Thank you — Pro for good.",
      action: "checkout",
    };
  }
  if (owned) {
    return {
      ...base,
      label: "Current plan",
      blocked: "This is the plan you are on.",
      action: "checkout",
    };
  }
  /* The trial costs nothing, so it does not wait for checkout to open. */
  if (pick !== "lifetime" && kind === "free" && plan?.trialEligible === true) {
    return {
      label: PRICE.trialCta,
      sub: PRICE.trialShort,
      blocked: null,
      action: "trial",
    };
  }
  /* Checkout is closed unless the server's `billing_checkout` switch says
     otherwise; a response without the field counts as closed. */
  if (plan && (!plan.configured || plan.checkoutEnabled !== true)) {
    return {
      ...base,
      blocked: "Checkout opens soon. Nothing is charged until it does.",
      action: "checkout",
    };
  }
  if (pick === "lifetime" && plan && !plan.lifetimeAvailable) {
    return {
      ...base,
      label: "Lifetime is closed",
      blocked: `All ${PRICE_CAP} Lifetime plans are taken.`,
      action: "checkout",
    };
  }
  return { ...base, blocked: null, action: "checkout" };
}

/** The one-line summary of a plan for the account banner and Settings. */
export function planLine(plan: Pick<V3Plan, "kind" | "trialDaysLeft">): string {
  switch (plan.kind) {
    case "trial": {
      const n = plan.trialDaysLeft;
      return n == null
        ? "Pro trial"
        : `Pro trial · ${n} ${n === 1 ? "day" : "days"} left`;
    }
    case "monthly":
      return `Pro · ${PRICE.monthly} / month`;
    case "yearly":
      return `Pro · ${PRICE.yearly} / year`;
    case "lifetime":
      return "Lifetime · thank you";
    default:
      return "Free";
  }
}

/**
 * Whether this account can still start the free trial: Free, address
 * confirmed, and no trial yet under it (`trialEligible` from the server).
 * Every "Try Pro free for N days" line asks this first, so an account whose
 * trial has ended is not offered another one.
 */
export function offersTrial(
  plan:
    | (Pick<V3Plan, "kind"> & Partial<Pick<V3Plan, "trialEligible">>)
    | null
    | undefined
): boolean {
  return plan?.kind === "free" && plan.trialEligible === true;
}

/** Pro features are on for the trial and every paid plan. */
export function isPro(kind: V3Plan["kind"] | undefined | null): boolean {
  return (
    kind === "trial" ||
    kind === "monthly" ||
    kind === "yearly" ||
    kind === "lifetime"
  );
}

export interface ProLimitFacts {
  used: number;
  max: number;
  noun: string;
}

/** "1 of 1 mail accounts" / "3 boards · Free includes 1" (ProLimit). */
export function proLimitText({ used, max, noun }: ProLimitFacts): string {
  return used > max
    ? `${used} ${noun} · Free includes ${max}`
    : `${used} of ${max} ${noun}`;
}

/** The "Upgrade for more" link shows once the Free allowance is used up. */
export function proLimitFull({ used, max }: ProLimitFacts): boolean {
  return used >= max;
}

/* ── What each plan includes, from the limits the server enforces ─────────── */

type Limits = PlanLimits;

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** "1 calendar" / "Unlimited calendars"; null when the plan has none. */
function countLine(n: number | null, one: string, many: string): string | null {
  if (n === null) return `Unlimited ${many}`;
  if (n <= 0) return null;
  return plural(n, one, many);
}

function limitLines(l: Limits): string[] {
  const tasks =
    l.autoScheduledTasks === null
      ? "Unlimited auto-scheduled tasks"
      : l.autoScheduledTasks > 0
        ? `${plural(l.autoScheduledTasks, "auto-scheduled task", "auto-scheduled tasks")} a month`
        : null;
  return [
    countLine(l.calendars, "calendar", "calendars"),
    tasks,
    countLine(l.boards, "board", "boards"),
    countLine(l.mailboxes, "mail account", "mail accounts"),
    countLine(l.bookingPages, "booking page", "booking pages"),
    l.remindersPerTask === null
      ? "Unlimited reminders per task"
      : countLine(
          l.remindersPerTask,
          "reminder per task",
          "reminders per task"
        ),
  ].filter((x): x is string => x !== null);
}

/** The Free line: what every account has, then the Free limits. */
export function freeIncludes(l: Limits = PLAN_LIMITS.FREE): string[] {
  return ["Tasks and projects", "Docs", ...limitLines(l)];
}

/** "Every Pro plan includes": AI (no counts), the Pro limits, Pro switches. */
export function proIncludes(
  l: Limits = PLAN_LIMITS.PRO
): ReadonlyArray<readonly [string, string | null]> {
  const out: Array<readonly [string, string | null]> = [];
  if (l.aiAgent) out.push(["AI included", "Plan my day and Ask Needt"]);
  for (const line of limitLines(l)) out.push([line, null]);
  if (l.focusStats || l.advancedFocusModes)
    out.push([
      l.focusStats && l.advancedFocusModes
        ? "Focus stats and advanced focus modes"
        : l.focusStats
          ? "Focus stats"
          : "Advanced focus modes",
      null,
    ]);
  if (l.advancedNudges) out.push(["Advanced nudges", null]);
  return out;
}
