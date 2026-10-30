/**
 * The one place prices, the lifetime seat cap and the trial length live.
 * Server code (checkout, lifetime cap, trial grants) and every screen read
 * from here; nothing else spells "$59", "300" or "14 days".
 */
export const NEEDT_PRICING = {
  currency: "USD",
  trialDays: 14,
  free: {
    name: "Free",
    amountCents: 0,
  },
  pro: {
    name: "Pro",
    month: {
      amountCents: 700,
      productEnv: "CREEM_PRODUCT_PRO_MONTHLY",
    },
    year: {
      amountCents: 5_900,
      productEnv: "CREEM_PRODUCT_PRO_YEARLY",
    },
  },
  lifetime: {
    name: "Lifetime",
    amountCents: 14_900,
    /** First N buyers only. How many are left comes from the server. */
    cap: 300,
    productEnv: "CREEM_PRODUCT_LIFETIME",
  },
  /**
   * 40% off Pro monthly and Pro yearly, for as long as the subscription runs
   * (docs/students.md). One Creem discount, duration "forever", restricted to
   * the two Pro products; Lifetime is never discounted. The code's name lives
   * in an env var so the test and live stores can differ.
   */
  student: {
    percentOff: 40,
    discountCodeEnv: "CREEM_STUDENT_DISCOUNT_CODE",
  },
} as const;

/** A Pro price with the student discount: 700 → 420, 5900 → 3540. */
export function studentAmountCents(amountCents: number): number {
  return Math.round(
    (amountCents * (100 - NEEDT_PRICING.student.percentOff)) / 100
  );
}

/** The shared student code checkout pre-applies, or null while it is unset. */
export function getStudentDiscountCode(): string | null {
  return envValue(NEEDT_PRICING.student.discountCodeEnv);
}

export type BillingCheckoutSelection =
  | { plan: "pro"; interval: "month" | "year" }
  | { plan: "lifetime"; interval?: never };

export type CreemProductIds = {
  proMonthly: string | null;
  proYearly: string | null;
  lifetime: string | null;
};

function envValue(name: string): string | null {
  const value = process.env[name]?.trim();
  return value || null;
}

export function getCreemProductIds(): CreemProductIds {
  return {
    proMonthly: envValue(NEEDT_PRICING.pro.month.productEnv),
    proYearly: envValue(NEEDT_PRICING.pro.year.productEnv),
    lifetime: envValue(NEEDT_PRICING.lifetime.productEnv),
  };
}

export function getCreemProductId(
  selection: BillingCheckoutSelection,
  products = getCreemProductIds()
): string | null {
  if (selection.plan === "lifetime") return products.lifetime;
  return selection.interval === "year"
    ? products.proYearly
    : products.proMonthly;
}

export function isCreemConfigured(): boolean {
  const products = getCreemProductIds();
  return Boolean(
    process.env.CREEM_API_KEY?.trim() &&
      process.env.CREEM_WEBHOOK_SECRET?.trim() &&
      products.proMonthly &&
      products.proYearly &&
      products.lifetime
  );
}

export function isCreemClientConfigured(): boolean {
  return Boolean(process.env.CREEM_API_KEY?.trim());
}

export function isCreemWebhookConfigured(): boolean {
  return Boolean(process.env.CREEM_WEBHOOK_SECRET?.trim());
}

export function formatBillingPrice(amountCents: number): string {
  return `$${Math.round(amountCents / 100)}`;
}

/**
 * Whole dollars when the amount is whole, cents when it is not. The plan
 * prices are round; a monthly equivalent derived from a yearly one is not,
 * and rounding $4.92 up to $5 overstates what the yearly plan costs.
 */
export function formatBillingPriceExact(amountCents: number): string {
  const dollars = amountCents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}
