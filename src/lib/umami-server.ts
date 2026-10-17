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
 * Server-side Umami `purchase` event (`POST {UMAMI_HOST}/api/send`), recorded
 * on the landing site (`UMAMI_LANDING_WEBSITE_ID`) so the needt.app funnel
 * ends in a payment. It carries the plan and nothing about the person.
 * Skipped when the environment is missing; any failure is only logged and
 * never reaches the webhook. Callers do not await it.
 */
export async function sendUmamiPurchase(plan: PurchasePlan): Promise<void> {
  const host = process.env.UMAMI_HOST?.trim().replace(/\/+$/, "");
  const website = process.env.UMAMI_LANDING_WEBSITE_ID?.trim();
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
          hostname: "needt.app",
          url: "/",
          name: "purchase",
          data: { plan },
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      logger.warn(
        "Umami purchase event was refused",
        { status: response.status },
        LOG_SOURCE
      );
    }
  } catch (error) {
    logger.warn(
      "Umami purchase event failed",
      { error: error instanceof Error ? error.message : "Unknown error" },
      LOG_SOURCE
    );
  }
}
