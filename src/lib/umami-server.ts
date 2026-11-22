import type { UtmTags } from "@/lib/attribution";
import { logger } from "@/lib/logger";

const LOG_SOURCE = "UmamiServer";
const TIMEOUT_MS = 3_000;

export type PurchasePlan = "pro_year" | "pro_month" | "lifetime";

/**
 * What a paid plan is called in the `purchase` event, or null when the
 * subscription row does not say (then nothing is sent).
 */
export function purchasePlan(
  plan: "PRO" | "LIFETIME" | "FREE",
  interval: "month" | "year" | null
): PurchasePlan | null {
  if (plan === "LIFETIME") return "lifetime";
  if (plan !== "PRO") return null;
  if (interval === "year") return "pro_year";
  if (interval === "month") return "pro_month";
  return null;
}

/**
 * Which Umami website a server-side event belongs to. `landing` is the
 * needt.app site (`UMAMI_LANDING_WEBSITE_ID`): the acquisition funnel, from
 * the first visit to `purchase`. `app` is the use.needt.app site
 * (`NEXT_PUBLIC_UMAMI_WEBSITE_ID`, the id the browser tracker already uses;
 * Next inlines it at build time, so the build arg decides whether these are sent):
 * product-internal events such as the Agents hub, which must not mix into the
 * funnel.
 */
export type UmamiTarget = "landing" | "app";

function targetWebsite(target: UmamiTarget): { id?: string; hostname: string } {
  if (target === "app") {
    return {
      id: process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID?.trim(),
      hostname: "use.needt.app",
    };
  }
  return {
    id: process.env.UMAMI_LANDING_WEBSITE_ID?.trim(),
    hostname: "needt.app",
  };
}

/**
 * Server-side Umami event (`POST {UMAMI_HOST}/api/send`), recorded on the
 * landing site by default (see `UmamiTarget`). `data` must hold ids, kinds and
 * outcomes only, never a person or their text. Skipped when the environment
 * is missing; any failure is only logged and never reaches the caller.
 * Callers do not await it. `distinctId` is an optional pseudonymous id.
 */
export async function sendUmamiEvent(
  name: string,
  data: Record<string, string | number | boolean>,
  target: UmamiTarget = "landing",
  distinctId?: string
): Promise<void> {
  const host = process.env.UMAMI_HOST?.trim().replace(/\/+$/, "");
  const { id: website, hostname } = targetWebsite(target);
  if (!host || !website) return;
  try {
    const response = await fetch(`${host}/api/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Umami drops requests whose agent looks like a bot (Node's default
        // does), so the call presents as an ordinary browser.
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
      body: JSON.stringify({
        type: "event",
        payload: {
          website,
          hostname,
          url: "/",
          name,
          data,
          /* Umami 2.18+ treats `id` as the distinct id, so one person is one
             visitor instead of every server call folding into one. Older
             versions ignore the field. */
          ...(distinctId ? { id: distinctId } : {}),
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      logger.warn(
        "Umami event was refused",
        { name, status: response.status },
        LOG_SOURCE
      );
    }
  } catch (error) {
    logger.warn(
      "Umami event failed",
      {
        name,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      LOG_SOURCE
    );
  }
}

/** The `purchase` event: carries the plan and nothing about the person. */
export function sendUmamiPurchase(plan: PurchasePlan): Promise<void> {
  return sendUmamiEvent("purchase", { plan });
}

/**
 * The `signup_completed` event: one account was created. Carries the sign-in
 * method (`credentials` or the NextAuth provider id) and the campaign tags (`utm_*`) the visitor arrived with, never an
 * id, name or address. The caller sends it exactly where the account row is
 * created, so it fires once per user.
 */
export function sendUmamiSignupCompleted(
  method: string,
  utm: UtmTags = {}
): Promise<void> {
  return sendUmamiEvent("signup_completed", { method, ...utm });
}

export type TrialSource = "oauth" | "email_confirm" | "paywall";

/** The `trial_started` event: a trial grant was created (not re-read). */
export function sendUmamiTrialStarted(source: TrialSource): Promise<void> {
  return sendUmamiEvent("trial_started", { source });
}
