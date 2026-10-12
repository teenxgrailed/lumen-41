/**
 * Price strings for every v3 surface (prototype paywall.jsx `needtPrice`),
 * derived from the one `NEEDT_PRICING` module. Nothing here hard-codes a
 * price, the lifetime cap or the trial length.
 */
import { NEEDT_PRICING } from "@/lib/creem/config";

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
  footnote: string;
}

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

export function priceStrings(P: PricingInput = NEEDT_PRICING): PriceStrings {
  const month = P.pro.month.amountCents;
  const year = P.pro.year.amountCents;
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
    footnote: `Prices in ${P.currency}. Taxes may apply.`,
  };
}

/** "212 of 300 left" from the server's count, or the cap alone while unknown. */
export function lifetimeLeftLine(left: number | null | undefined, cap: number) {
  if (left === null || left === undefined) return `First ${cap} buyers`;
  return `${Math.max(0, left)} of ${cap} left`;
}
