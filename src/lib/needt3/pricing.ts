/**
 * Price strings for every v3 surface (prototype paywall.jsx `needtPrice`),
 * derived from the one `NEEDT_PRICING` module. Nothing here hard-codes a
 * price, the lifetime cap or the trial length.
 */
import { NEEDT_PRICING, studentAmountCents } from "@/lib/creem/config";

/** "$7", "$4.92": whole dollars when whole, cents when not. */
export function money(cents: number) {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

export interface PriceStrings {
  monthly: string;
  yearly: string;
  lifetime: string;
  /** The yearly price per month, "$4.92". */
  yearlyPerMonth: string;
  /** What yearly saves against twelve months, "$25". */
  saveAmount: string;
  savePct: number;
  trialDays: number;
  lifetimeCap: number;
  trialCta: string;
  trialShort: string;
  trialTerms: string;
  /** For a Free account that cannot start a trial: what Pro costs. */
  plansShort: string;
  /** Under a paid plan's button when no trial applies: checkout takes a card. */
  paidShort: string;
  /**
   * Under every Pro subscribe button: price, period, that it renews until
   * cancelled, and where to cancel. Lifetime says it is one payment.
   */
  renewalMonthly: string;
  renewalYearly: string;
  renewalLifetime: string;
  /** The same in one line for a screen that shows all three plans at once. */
  renewalAll: string;
  footnote: string;
  /** The Pro prices above are the student price (40% off; Lifetime never). */
  student: boolean;
  /** "Student price · 40% off Pro", shown when `student` is set. */
  studentLine: string;
}

/**
 * Where a subscriber cancels: Settings opens on "Plan & billing", and
 * "Invoices and payment" there opens the Creem billing portal
 * (`POST /api/billing/portal`). It is the same path on desktop and phone.
 */
export const CANCEL_PATH = "Settings → Plan & billing → Invoices and payment";

/** The slice of NEEDT_PRICING the strings need; a test can pass its own. */
export interface PricingInput {
  currency: string;
  trialDays: number;
  pro: {
    month: { amountCents: number };
    year: { amountCents: number };
  };
  lifetime: { amountCents: number; cap: number };
}

/**
 * `student`: the Pro prices with the student discount ($4.20 / month,
 * $35.40 / year); Lifetime stays as it is. Every Pro line, the renewal terms
 * included, then names the price the person will actually pay.
 */
export function priceStrings(
  P: PricingInput = NEEDT_PRICING,
  opts: { student?: boolean } = {}
): PriceStrings {
  const student = opts.student === true;
  const pro = (cents: number) => (student ? studentAmountCents(cents) : cents);
  const month = pro(P.pro.month.amountCents);
  const year = pro(P.pro.year.amountCents);
  const save = month * 12 - year;
  return {
    monthly: money(month),
    yearly: money(year),
    lifetime: money(P.lifetime.amountCents),
    yearlyPerMonth: money(year / 12),
    saveAmount: money(save),
    savePct: Math.round((save / (month * 12)) * 100),
    trialDays: P.trialDays,
    lifetimeCap: P.lifetime.cap,
    trialCta: `Start ${P.trialDays}-day free trial`,
    trialShort: `${P.trialDays} days free · no card needed`,
    trialTerms:
      "When the trial ends you go back to Free unless you choose a plan — we’ll remind you 3 days before. No card, no automatic charge.",
    plansShort: `Pro from ${money(year / 12)}/mo`,
    paidShort: "Paid by card at checkout",
    renewalMonthly: `${money(month)} per month, charged at checkout. Renews automatically every month until you cancel. Cancel any time in ${CANCEL_PATH}.`,
    renewalYearly: `${money(year)} per year, charged at checkout. Renews automatically every year until you cancel. Cancel any time in ${CANCEL_PATH}.`,
    renewalLifetime: `${money(P.lifetime.amountCents)} one-time payment. No subscription and no renewal.`,
    renewalAll: `Pro renews automatically every month or year until you cancel; cancel any time in ${CANCEL_PATH}. Lifetime is one payment with no renewal.`,
    footnote: `Prices in ${P.currency}. Taxes may apply.`,
    student,
    studentLine: `Student price · ${NEEDT_PRICING.student.percentOff}% off Pro`,
  };
}

/** "212 of 300 left" from the server's count, or the cap alone while unknown. */
export function lifetimeLeftLine(left: number | null | undefined, cap: number) {
  if (left === null || left === undefined) return `First ${cap} buyers`;
  return `${Math.max(0, left)} of ${cap} left`;
}
