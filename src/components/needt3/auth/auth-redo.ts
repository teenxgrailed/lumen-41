/**
 * THE AUTH REDO (design review, 2026-11-20): which card variant a visitor
 * sees, which plan they arrived with, and which provider buttons the card
 * draws. Pure logic, no DOM, so it is testable.
 *
 * Variant A is "sign in with a plan": the plan that was picked (a billing
 * deep link, or `?plan=`) rides on top of the card as a chip. Variant B is the
 * plain card. `?v=a` / `?v=b` force one for review; without it the card is A
 * when a plan came along and B otherwise. TEMPORARY: the param goes once the
 * owner has picked.
 */
import { NEEDT_PRICING, formatBillingPriceExact } from "@/lib/creem/config";

import type { AuthProvider } from "./AuthScreen";

export type AuthCardVariant = "a" | "b";
export type PlanId = "pro-year" | "pro-month" | "lifetime";

export interface PlanChoice {
  readonly id: PlanId;
  /** "Pro" or "Lifetime". */
  readonly name: string;
  /** "$59/year", "$7/month", "$149 once". */
  readonly price: string;
  /** The line under the chip. */
  readonly note: string;
}

const price = formatBillingPriceExact;

export function planChoice(id: PlanId): PlanChoice {
  const days = NEEDT_PRICING.trialDays;
  if (id === "pro-month")
    return {
      id,
      name: NEEDT_PRICING.pro.name,
      price: `${price(NEEDT_PRICING.pro.month.amountCents)}/month`,
      note: `${days} days of Pro first. Billing starts after the trial.`,
    };
  if (id === "lifetime")
    return {
      id,
      name: NEEDT_PRICING.lifetime.name,
      price: `${price(NEEDT_PRICING.lifetime.amountCents)} once`,
      note: `Pay once, keep Pro. First ${NEEDT_PRICING.lifetime.cap} buyers.`,
    };
  return {
    id: "pro-year",
    name: NEEDT_PRICING.pro.name,
    price: `${price(NEEDT_PRICING.pro.year.amountCents)}/year`,
    note: `${days} days of Pro first. Billing starts after the trial.`,
  };
}

function planId(value: string | null): PlanId | null {
  return value === "pro-year" || value === "pro-month" || value === "lifetime"
    ? value
    : null;
}

/** The plan in `?plan=` or in the `checkout=` of the callback URL. */
export function planFromSearch(search: string): PlanChoice | null {
  const params = new URLSearchParams(search);
  let id = planId(params.get("plan"));
  if (!id) {
    const callback = params.get("callbackUrl");
    if (callback) {
      try {
        id = planId(
          new URL(callback, "https://needt.local").searchParams.get("checkout")
        );
      } catch {
        id = null;
      }
    }
  }
  return id ? planChoice(id) : null;
}

export interface AuthRedoState {
  readonly variant: AuthCardVariant;
  readonly plan: PlanChoice | null;
  /** `?v=` was given: draw the provider buttons the server has not wired yet. */
  readonly preview: boolean;
  /** "soon": the ChatGPT slot is drawn, disabled. */
  readonly chatgpt: "hidden" | "soon";
}

export const AUTH_REDO_DEFAULT: AuthRedoState = {
  variant: "b",
  plan: null,
  preview: false,
  chatgpt: "hidden",
};

export function authRedoFromSearch(search: string): AuthRedoState {
  const params = new URLSearchParams(search);
  const forced = params.get("v");
  const found = planFromSearch(search);
  const variant: AuthCardVariant =
    forced === "a" ? "a" : forced === "b" ? "b" : found ? "a" : "b";
  const plan =
    variant === "a"
      ? (found ?? (forced === "a" ? planChoice("pro-year") : null))
      : null;
  return {
    variant,
    plan,
    preview: forced === "a" || forced === "b",
    chatgpt: params.get("chatgpt") === "soon" ? "soon" : "hidden",
  };
}

/** A provider button; `visualOnly` has no provider behind it yet. */
export interface RedoProvider extends AuthProvider {
  readonly visualOnly?: boolean;
  readonly soon?: boolean;
}

/** Owner order 2026-11-20: Google, Apple, Microsoft, then email. */
export const REDO_MAIN_IDS = ["google", "apple", "azure-ad"] as const;

const LABELS: Record<string, string> = {
  google: "Google",
  apple: "Apple",
  "azure-ad": "Microsoft",
  openai: "ChatGPT",
};

export function redoProviders(
  configured: readonly AuthProvider[],
  icons: Readonly<Record<string, AuthProvider["icon"]>>,
  opts: { preview: boolean; chatgpt: "hidden" | "soon" }
): { main: RedoProvider[]; more: RedoProvider[] } {
  const byId = new Map(configured.map((p) => [p.id, p]));
  const main: RedoProvider[] = [];
  for (const id of REDO_MAIN_IDS) {
    const real = byId.get(id);
    if (real) main.push(real);
    else if (opts.preview)
      main.push({ id, label: LABELS[id], icon: icons[id], visualOnly: true });
  }
  const openai = byId.get("openai");
  if (openai) main.push(openai);
  else if (opts.chatgpt === "soon")
    main.push({
      id: "openai",
      label: LABELS.openai,
      icon: icons.openai,
      visualOnly: true,
      soon: true,
    });
  const mainIds = new Set<string>([...REDO_MAIN_IDS, "openai"]);
  const more = configured.filter((p) => !mainIds.has(p.id));
  return main.length ? { main, more } : { main: [...more], more: [] };
}
