import { SubscriptionPlan } from "@prisma/client";

/**
 * Apple In-App Purchase (StoreKit 2) configuration: the product ids the
 * native apps sell, and the environment the server verifies against.
 * docs/billing/apple-iap.md is the contract the native side builds on.
 */

export const APPLE_PRODUCT_IDS = {
  proMonthly: "app.needt.pro.monthly",
  proYearly: "app.needt.pro.yearly",
  lifetime: "app.needt.lifetime",
} as const;

export const APPLE_PRODUCTS: readonly string[] = [
  APPLE_PRODUCT_IDS.proMonthly,
  APPLE_PRODUCT_IDS.proYearly,
  APPLE_PRODUCT_IDS.lifetime,
];

/** Where the web sends an Apple subscriber: cancelling happens on the device. */
export const APPLE_MANAGE_SUBSCRIPTIONS_URL =
  "https://apps.apple.com/account/subscriptions";

export type AppleProductPlan =
  | { plan: typeof SubscriptionPlan.PRO; interval: "month" | "year" }
  | { plan: typeof SubscriptionPlan.LIFETIME; interval: null };

export function applePlanForProduct(
  productId: string
): AppleProductPlan | null {
  switch (productId) {
    case APPLE_PRODUCT_IDS.proMonthly:
      return { plan: SubscriptionPlan.PRO, interval: "month" };
    case APPLE_PRODUCT_IDS.proYearly:
      return { plan: SubscriptionPlan.PRO, interval: "year" };
    case APPLE_PRODUCT_IDS.lifetime:
      return { plan: SubscriptionPlan.LIFETIME, interval: null };
    default:
      return null;
  }
}

/**
 * Only the two environments Apple signs. Xcode and LocalTesting payloads are
 * not signed by the App Store and the library skips verification for them, so
 * they can never be configured here.
 */
export type AppleIapEnvironment = "Production" | "Sandbox";

export type AppleIapConfig = {
  environment: AppleIapEnvironment;
  /** Production also accepts Sandbox-signed data (App Review buys in Sandbox). */
  allowSandbox: boolean;
  bundleIds: string[];
  /** Numeric App Apple ID; the library requires it to verify Production. */
  appAppleId: number | null;
};

export const DEFAULT_APPLE_BUNDLE_IDS = ["app.needt.ios", "app.needt.mac"];

function parseEnvironment(value: string | undefined): AppleIapEnvironment {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "production") return "Production";
  // Anything else, including unset, is Sandbox: a typo must never make the
  // server trust Production purchases it was not configured for.
  return "Sandbox";
}

export function getAppleIapConfig(
  env: NodeJS.ProcessEnv = process.env
): AppleIapConfig {
  const environment = parseEnvironment(env.APPLE_IAP_ENVIRONMENT);
  const bundleIds = (env.APPLE_IAP_BUNDLE_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const appAppleIdRaw = env.APPLE_IAP_APP_APPLE_ID?.trim();
  const appAppleId =
    appAppleIdRaw && /^\d+$/.test(appAppleIdRaw) ? Number(appAppleIdRaw) : null;
  return {
    environment,
    allowSandbox:
      environment === "Production" &&
      env.APPLE_IAP_ALLOW_SANDBOX?.trim().toLowerCase() === "true",
    bundleIds: bundleIds.length ? bundleIds : DEFAULT_APPLE_BUNDLE_IDS,
    appAppleId,
  };
}

/** Production verification cannot run without the numeric App Apple ID. */
export function isAppleIapConfigured(config = getAppleIapConfig()): boolean {
  return config.environment === "Sandbox" || config.appAppleId !== null;
}
