/**
 * THE AUTH REDO (design review, 2026-11-20, redone on the Craft references):
 * which plan a visitor arrived with and which provider buttons the card draws.
 * Pure logic, no DOM, so it is testable.
 *
 * One card. When a plan was picked (a billing deep link, or `?plan=`) a quiet
 * row on the card says which; "Start free instead" drops it.
 */
import { NEEDT_PRICING, formatBillingPriceExact } from "@/lib/creem/config";

import type { AuthProvider } from "./AuthScreen";

export type PlanId = "pro-year" | "pro-month" | "lifetime";

export interface PlanChoice {
  readonly id: PlanId;
  /** "Pro" or "Lifetime". */
  readonly name: string;
  /** "$59/year", "$7/month", "$149 once". */
  readonly price: string;
  /** "14 days free", "first 300 buyers". */
  readonly trial: string;
}

const price = formatBillingPriceExact;

export function planChoice(id: PlanId): PlanChoice {
  const days = NEEDT_PRICING.trialDays;
  if (id === "pro-month")
    return {
      id,
      name: NEEDT_PRICING.pro.name,
      price: `${price(NEEDT_PRICING.pro.month.amountCents)}/month`,
      trial: `${days} days free`,
    };
  if (id === "lifetime")
    return {
      id,
      name: NEEDT_PRICING.lifetime.name,
      price: `${price(NEEDT_PRICING.lifetime.amountCents)} once`,
      trial: `first ${NEEDT_PRICING.lifetime.cap} buyers`,
    };
  return {
    id: "pro-year",
    name: NEEDT_PRICING.pro.name,
    price: `${price(NEEDT_PRICING.pro.year.amountCents)}/year`,
    trial: `${days} days free`,
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
  readonly plan: PlanChoice | null;
  /** Draw the provider buttons the server has not wired yet (visual only). */
  readonly preview: boolean;
  /** "soon": the ChatGPT slot is drawn, disabled. */
  readonly chatgpt: "hidden" | "soon";
}

export const AUTH_REDO_DEFAULT: AuthRedoState = {
  plan: null,
  // todo(auth-redo): Apple and Microsoft are drawn for review before they are
  // wired; drop `preview` once both providers are configured.
  preview: true,
  chatgpt: "hidden",
};

export function authRedoFromSearch(search: string): AuthRedoState {
  const params = new URLSearchParams(search);
  return {
    plan: planFromSearch(search),
    preview: true,
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
  // ChatGPT stays out of the visible card for now (owner, 2026-11-20); the
  // slot is kept: `?chatgpt=soon` draws it disabled.
  if (opts.chatgpt === "soon")
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
