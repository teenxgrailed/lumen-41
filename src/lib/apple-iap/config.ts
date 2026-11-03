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
  /**
   * The server's App Store environment. Null when it is not configured: in
   * production an unset APPLE_IAP_ENVIRONMENT must not silently mean Sandbox
   * (every real purchase would be refused while the buyer is charged).
   */
  environment: AppleIapEnvironment | null;
  bundleIds: string[];
  /** Numeric App Apple ID; the library requires it to verify Production. */
  appAppleId: number | null;
  /**
   * Lower-cased account emails whose Sandbox (TestFlight) purchases a
   * Production server honours, as time-boxed Pro. The reviewer sandbox
   * account is always allowed; see `mayUseAppleSandbox`.
   */
  sandboxTesters: string[];
};

export const DEFAULT_APPLE_BUNDLE_IDS = ["app.needt.ios", "app.needt.mac"];

/** How long a Sandbox-signed purchase keeps Pro at most (never Lifetime). */
export const APPLE_SANDBOX_GRANT_MS = 24 * 60 * 60 * 1000;

function parseEnvironment(
  value: string | undefined,
  nodeEnv: string | undefined
): AppleIapEnvironment | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "production") return "Production";
  if (normalized === "sandbox") return "Sandbox";
  // Unset or a typo: not configured in production, Sandbox for development.
  return nodeEnv === "production" ? null : "Sandbox";
}

function list(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getAppleIapConfig(
  env: NodeJS.ProcessEnv = process.env
): AppleIapConfig {
  const bundleIds = list(env.APPLE_IAP_BUNDLE_IDS);
  const appAppleIdRaw = env.APPLE_IAP_APP_APPLE_ID?.trim();
  const appAppleId =
    appAppleIdRaw && /^\d+$/.test(appAppleIdRaw) ? Number(appAppleIdRaw) : null;
  return {
    environment: parseEnvironment(env.APPLE_IAP_ENVIRONMENT, env.NODE_ENV),
    bundleIds: bundleIds.length ? bundleIds : DEFAULT_APPLE_BUNDLE_IDS,
    appAppleId,
    sandboxTesters: list(env.APPLE_IAP_SANDBOX_TESTERS).map((email) =>
      email.toLowerCase()
    ),
  };
}

/** An environment is set, and Production has its numeric App Apple ID. */
export function isAppleIapConfigured(config = getAppleIapConfig()): boolean {
  if (config.environment === null) return false;
  return config.environment === "Sandbox" || config.appAppleId !== null;
}

/**
 * Whether a Production server honours this account's Sandbox-signed
 * purchases: the App Review sandbox login, or an allowlisted tester email.
 * Every Sandbox grant is time-boxed Pro (`timeBoxSandboxState`).
 */
export function mayUseAppleSandbox(
  account: { sandboxKind: string | null; email: string | null },
  config: AppleIapConfig = getAppleIapConfig()
): boolean {
  if (account.sandboxKind === "reviewer") return true;
  const email = account.email?.trim().toLowerCase();
  return Boolean(email && config.sandboxTesters.includes(email));
}
