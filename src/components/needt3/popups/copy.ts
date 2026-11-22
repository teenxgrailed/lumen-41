import { priceStrings } from "@/lib/needt3/pricing";

import type { UpsellCard } from "./UpsellPopup";

/**
 * The stock cards for the two moments the upsell popup is shown at. Prices
 * come from `priceStrings()` (the one NEEDT_PRICING module), so a price is
 * never typed here. The caller supplies the limit it knows ("3 habits") and
 * what each button does; the words around them are fixed so every limit
 * speaks the same way.
 */
export function limitCards(opts: {
  /** The limit, as a person says it: "3 habits", "10 Ask Needt actions". */
  limit: string;
  onTrial: () => void;
  onPlans: () => void;
  /** False once the trial was used: the first card then points at the plans. */
  canTrial: boolean;
  student?: boolean;
}): { title: string; body: string; cards: readonly [UpsellCard, UpsellCard] } {
  const p = priceStrings(undefined, { student: opts.student });
  return {
    title: "You've reached the Free limit",
    body: `Free includes ${opts.limit}. To add more:`,
    cards: [
      opts.canTrial
        ? {
            key: "trial",
            glyph: "gift",
            title: `Try Pro for ${p.trialDays} days`,
            body: "Every limit lifted. No card, and nothing is charged when it ends.",
            cta: p.trialCta,
            onSelect: opts.onTrial,
            primary: true,
          }
        : {
            key: "plans",
            glyph: "spark",
            title: "Keep going with Pro",
            body: `Every limit lifted. ${p.plansShort}.`,
            cta: "See plans",
            onSelect: opts.onPlans,
            primary: true,
          },
      {
        key: "lifetime",
        glyph: "stack",
        title: "Pay once",
        body: `Lifetime is ${p.lifetime}, paid once. Pro for good.`,
        cta: "See plans",
        onSelect: opts.onPlans,
      },
    ],
  };
}

export function trialCards(opts: {
  daysLeft: number;
  onKeep: () => void;
  onStayFree: () => void;
  student?: boolean;
}): { title: string; body: string; cards: readonly [UpsellCard, UpsellCard] } {
  const p = priceStrings(undefined, { student: opts.student });
  const when =
    opts.daysLeft <= 0
      ? "Your trial ends today"
      : opts.daysLeft === 1
        ? "Your trial ends tomorrow"
        : `Your trial ends in ${opts.daysLeft} days`;
  return {
    title: when,
    body: "After that you go back to Free unless you choose a plan. Nothing is charged by itself.",
    cards: [
      {
        key: "keep",
        glyph: "spark",
        title: "Keep Pro",
        body: `${p.yearly} a year, ${p.yearlyPerMonth} a month. Save ${p.savePct}% over paying monthly.`,
        cta: "Keep Pro",
        onSelect: opts.onKeep,
        primary: true,
      },
      {
        key: "free",
        glyph: "later",
        title: "Stay on Free",
        body: "Your tasks, pages and habits stay. What Free does not include pauses.",
        cta: "Continue on Free",
        onSelect: opts.onStayFree,
      },
    ],
  };
}
