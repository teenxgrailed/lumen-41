import { NEEDT_PRICING, formatBillingPriceExact } from "@/lib/creem/config";
import { PLAN_LIMITS } from "@/lib/plan-limits";

/** The 18 screens, in order. */
export const STEPS3 = [
  "welcome",
  "name",
  "cats",
  "tasks",
  "repeats",
  "priority",
  "days",
  "rhythm",
  "calendar",
  "thinking",
  "week",
  "notify",
  "account",
  "verify",
  "gift",
  "plans",
  "card",
  "opening",
] as const;
export type Step3 = (typeof STEPS3)[number];

/** Screens that count towards "n of 15" on the phone. */
export const COUNTED3 = STEPS3.slice(1, 16);

/** The header groups the 15 counted steps into four parts people can read. */
export const PHASES: ReadonlyArray<readonly [string, readonly Step3[]]> = [
  ["About you", ["name", "cats", "tasks", "repeats", "priority"]],
  ["Your time", ["days", "rhythm", "calendar"]],
  ["Your week", ["thinking", "week", "notify"]],
  ["Account", ["account", "verify", "gift", "plans", "card"]],
];

/** The page is dark only while Needt plans, for the gift and while it opens. */
export const DARK_STEPS: readonly Step3[] = ["thinking", "gift", "opening"];

export const isStep = (v: unknown): v is Step3 =>
  typeof v === "string" && (STEPS3 as readonly string[]).includes(v);

/** What Pro adds: same list and order as needt.app/pricing. */
export const PRO_ADDS = [
  ["planday", "Plan my day", "The agent puts your tasks into real hours"],
  [
    "rebuild",
    "Rebuilds when plans move",
    "A meeting moves, the rest of the day shifts",
  ],
  ["calendar", "All your calendars", "Google, Outlook and iCloud on one grid"],
  [
    "tasks",
    "Unlimited auto-scheduling",
    `Every task gets a slot, not ${PLAN_LIMITS.FREE.autoScheduledTasks} a month`,
  ],
  ["mail", "Mail inside Needt", "Up to 3 mailboxes, email to task"],
  ["ai", "Your AI sees your tasks", "Claude, ChatGPT, Cursor over MCP + API"],
  ["booking", "Booking pages", "People book time that fits your plan"],
  ["stats", "Focus stats", "See where the week went"],
] as const;

/** Prices come from src/lib/creem/config.ts and nowhere else. */
export const PRICES = (() => {
  const month = NEEDT_PRICING.pro.month.amountCents;
  const year = NEEDT_PRICING.pro.year.amountCents;
  return {
    month: formatBillingPriceExact(month),
    year: formatBillingPriceExact(year),
    yearPerMonth: formatBillingPriceExact(Math.round(year / 12)),
    save: Math.round((1 - year / (month * 12)) * 100),
    lifetime: formatBillingPriceExact(NEEDT_PRICING.lifetime.amountCents),
    seats: NEEDT_PRICING.lifetime.cap,
    freeTasks: PLAN_LIMITS.FREE.autoScheduledTasks ?? 0,
    freeCalendars: PLAN_LIMITS.FREE.calendars ?? 1,
    trialDays: NEEDT_PRICING.trialDays,
  };
})();

export const longDate = (d: Date) =>
  d.toLocaleDateString("en", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

export const giftEndFromNow = () => {
  const d = new Date();
  d.setDate(d.getDate() + PRICES.trialDays);
  return d;
};
