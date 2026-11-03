/**
 * Apple in-app purchase bridge for the iOS shell (apps/ios). Typed wrappers
 * around the `NeedtStore` Capacitor plugin (StoreKit 2, see
 * apps/ios/ios/App/App/NeedtPlugins.swift) and the orchestration that turns a
 * StoreKit transaction into a Needt billing state through the server.
 *
 * Outside the iOS app every function here is a no-op that resolves with an
 * "unavailable" value, and none of them throws: a purchase screen can call
 * them without checking where it runs.
 *
 * Flow of a purchase (`buyWithApple`):
 *   GET  /api/billing/apple/account-token -> { appAccountToken, enabled, products }
 *   NeedtStore.purchase({ id, appAccountToken }) -> signed transaction (JWS)
 *   POST /api/billing/apple/transactions { signedTransaction } -> billing state
 *   NeedtStore.finish({ transactionId })   (only after a 2xx)
 * A transaction the server did not accept is never finished, so StoreKit hands
 * it back on the next launch and `subscribeAppleTransactionUpdates` retries it.
 */
import { isIosApp } from "@/lib/native";

export const APPLE_PRODUCT_IDS = {
  proMonthly: "app.needt.pro.monthly",
  proYearly: "app.needt.pro.yearly",
  lifetime: "app.needt.lifetime",
} as const;

export type AppleProductId =
  (typeof APPLE_PRODUCT_IDS)[keyof typeof APPLE_PRODUCT_IDS];

export const ACCOUNT_TOKEN_PATH = "/api/billing/apple/account-token";
export const TRANSACTIONS_PATH = "/api/billing/apple/transactions";

export interface StorePeriod {
  unit: "day" | "week" | "month" | "year" | "unknown";
  value: number;
}

export interface StoreIntroOffer {
  displayPrice: string;
  price: string;
  period: StorePeriod;
  periodCount: number;
  paymentMode?: "freeTrial" | "payAsYouGo" | "payUpFront";
}

export interface StoreProduct {
  id: string;
  displayName: string;
  description: string;
  /** Localised, with the currency symbol ("CHF 7.00"). */
  displayPrice: string;
  /** Decimal string ("7.00"), for maths; never show it. */
  price: string;
  currencyCode: string;
  type:
    | "autoRenewable"
    | "nonConsumable"
    | "consumable"
    | "nonRenewable"
    | "unknown";
  period?: StorePeriod;
  introOffer?: StoreIntroOffer;
  isFamilyShareable: boolean;
}

/** A verified StoreKit transaction as the plugin hands it over. */
export interface StoreTransaction {
  signedTransaction: string;
  productId: string;
  transactionId: string;
}

export type StorePurchaseResult =
  | ({ status: "success" } & StoreTransaction)
  | { status: "pending" }
  | { status: "cancelled" }
  | { status: "failed"; message?: string };

/** What `POST /api/billing/apple/transactions` returns; shape owned by the server. */
export type AppleBillingState = Record<string, unknown>;

type ListenerHandle = { remove?: () => unknown } | undefined;

interface StorePlugin {
  products?: (a: { ids: string[] }) => Promise<{ products?: StoreProduct[] }>;
  purchase?: (a: {
    id: string;
    appAccountToken: string;
  }) => Promise<StorePurchaseResult>;
  finish?: (a: { transactionId: string }) => Promise<{ finished?: boolean }>;
  restore?: () => Promise<{ transactions?: StoreTransaction[] }>;
  entitlements?: () => Promise<{ transactions?: StoreTransaction[] }>;
  pendingTransactions?: () => Promise<{ transactions?: StoreTransaction[] }>;
  manageSubscriptions?: () => Promise<unknown>;
  addListener?: (
    event: string,
    cb: (t: StoreTransaction) => void
  ) => Promise<ListenerHandle> | ListenerHandle;
}

function plugin(): StorePlugin | null {
  if (!isIosApp()) return null;
  const cap = (
    window as unknown as {
      Capacitor?: { Plugins?: Record<string, StorePlugin | undefined> };
    }
  ).Capacitor;
  return cap?.Plugins?.NeedtStore ?? null;
}

/** True inside the iOS app when the `NeedtStore` plugin is registered. */
export function isAppleStoreAvailable(): boolean {
  return plugin() !== null;
}

function messageOf(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  const m = (error as { message?: unknown } | null)?.message;
  return typeof m === "string" && m ? m : fallback;
}

function isTransaction(value: unknown): value is StoreTransaction {
  const t = value as Partial<StoreTransaction> | null;
  return (
    !!t &&
    typeof t.signedTransaction === "string" &&
    typeof t.transactionId === "string" &&
    typeof t.productId === "string"
  );
}

// -- typed wrappers over the plugin ------------------------------------------

/** Product info from the App Store; `[]` when unavailable or on error. */
export async function getStoreProducts(ids: string[]): Promise<StoreProduct[]> {
  try {
    const res = await plugin()?.products?.({ ids });
    return Array.isArray(res?.products) ? res.products : [];
  } catch {
    return [];
  }
}

/** Runs the system purchase sheet. Never rejects. */
export async function purchaseStoreProduct(
  id: string,
  appAccountToken: string
): Promise<StorePurchaseResult | { status: "unavailable" }> {
  const p = plugin();
  if (!p?.purchase) return { status: "unavailable" };
  try {
    const res = await p.purchase({ id, appAccountToken });
    if (res?.status === "success") {
      return isTransaction(res)
        ? res
        : {
            status: "failed",
            message: "The App Store returned no transaction",
          };
    }
    if (res?.status === "pending" || res?.status === "cancelled") return res;
    return {
      status: "failed",
      message: res?.status === "failed" ? res.message : undefined,
    };
  } catch (error) {
    return { status: "failed", message: messageOf(error, "Purchase failed") };
  }
}

/** Marks a transaction finished in StoreKit. False when it could not. */
export async function finishStoreTransaction(
  transactionId: string
): Promise<boolean> {
  try {
    const res = await plugin()?.finish?.({ transactionId });
    return res?.finished === true;
  } catch {
    return false;
  }
}

export type StoreListResult =
  | { status: "ok"; transactions: StoreTransaction[] }
  | { status: "cancelled" }
  | { status: "unavailable" }
  | { status: "failed"; message: string };

async function listTransactions(
  method: "restore" | "entitlements" | "pendingTransactions"
): Promise<StoreListResult> {
  const fn = plugin()?.[method];
  if (!fn) return { status: "unavailable" };
  try {
    const res = await fn();
    const list = Array.isArray(res?.transactions) ? res.transactions : [];
    return { status: "ok", transactions: list.filter(isTransaction) };
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code === "cancelled") return { status: "cancelled" };
    return { status: "failed", message: messageOf(error, "App Store error") };
  }
}

/** `AppStore.sync()`, then every current entitlement. */
export function restoreStoreTransactions(): Promise<StoreListResult> {
  return listTransactions("restore");
}

/** Current entitlements without asking the App Store to sync. */
export function getStoreEntitlements(): Promise<StoreListResult> {
  return listTransactions("entitlements");
}

/** Updates the plugin received that nobody finished yet. */
export function getPendingStoreTransactions(): Promise<StoreListResult> {
  return listTransactions("pendingTransactions");
}

/** Opens the system subscription management sheet. False when unavailable. */
export async function manageAppleSubscriptions(): Promise<boolean> {
  const fn = plugin()?.manageSubscriptions;
  if (!fn) return false;
  try {
    await fn();
    return true;
  } catch {
    return false;
  }
}

// -- server calls ---------------------------------------------------------------

type ServerResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; status?: number };

async function serverCall<T>(
  path: string,
  init?: RequestInit
): Promise<ServerResult<T>> {
  try {
    const res = await fetch(path, {
      credentials: "same-origin",
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
    const body = (await res.json().catch(() => null)) as
      | (T & { error?: unknown })
      | null;
    if (!res.ok) {
      const err = body?.error;
      return {
        ok: false,
        status: res.status,
        message:
          typeof err === "string" ? err : `Request failed (${res.status})`,
      };
    }
    return { ok: true, data: (body ?? {}) as T };
  } catch (error) {
    return { ok: false, message: messageOf(error, "Network error") };
  }
}

interface AccountToken {
  appAccountToken: string;
  enabled: boolean;
  products: string[];
}

/** Posts a signed transaction. Resolves with the billing state on a 2xx. */
async function postTransaction(
  signedTransaction: string
): Promise<ServerResult<AppleBillingState>> {
  return serverCall<AppleBillingState>(TRANSACTIONS_PATH, {
    method: "POST",
    body: JSON.stringify({ signedTransaction }),
  });
}

/** Post, then finish only after a 2xx. */
async function syncTransaction(
  t: StoreTransaction
): Promise<ServerResult<AppleBillingState>> {
  const res = await postTransaction(t.signedTransaction);
  if (res.ok) await finishStoreTransaction(t.transactionId);
  return res;
}

// -- orchestration -------------------------------------------------------------

export type BuyWithAppleResult =
  | { status: "success"; billing: AppleBillingState }
  | { status: "pending" }
  | { status: "cancelled" }
  | { status: "unavailable" }
  | { status: "failed"; message: string };

/**
 * Buys `productId` with Apple and returns the resulting billing state.
 * "pending" is Ask to Buy / SCA: the approval arrives later through
 * `subscribeAppleTransactionUpdates`.
 */
export async function buyWithApple(
  productId: string
): Promise<BuyWithAppleResult> {
  if (!isAppleStoreAvailable()) return { status: "unavailable" };

  const token = await serverCall<AccountToken>(ACCOUNT_TOKEN_PATH);
  if (!token.ok) return { status: "failed", message: token.message };
  if (!token.data.enabled || !token.data.appAccountToken) {
    return { status: "failed", message: "Apple purchases are not enabled" };
  }
  if (
    Array.isArray(token.data.products) &&
    !token.data.products.includes(productId)
  ) {
    return { status: "failed", message: "This product is not for sale" };
  }

  const bought = await purchaseStoreProduct(
    productId,
    token.data.appAccountToken
  );
  if (bought.status === "unavailable") return { status: "unavailable" };
  if (bought.status === "pending" || bought.status === "cancelled") {
    return { status: bought.status };
  }
  if (bought.status === "failed") {
    return { status: "failed", message: bought.message ?? "Purchase failed" };
  }

  const synced = await syncTransaction(bought);
  if (!synced.ok) {
    // not finished: StoreKit redelivers it and the update listener retries
    return { status: "failed", message: synced.message };
  }
  return { status: "success", billing: synced.data };
}

export type RestoreApplePurchasesResult =
  | { status: "restored"; count: number; billing: AppleBillingState }
  | { status: "empty" }
  | { status: "cancelled" }
  | { status: "unavailable" }
  | { status: "failed"; message: string };

/** "Restore purchases": syncs with the App Store and posts every entitlement. */
export async function restoreApplePurchases(): Promise<RestoreApplePurchasesResult> {
  const restored = await restoreStoreTransactions();
  if (restored.status !== "ok") return restored;
  if (restored.transactions.length === 0) return { status: "empty" };

  let billing: AppleBillingState | null = null;
  let count = 0;
  let lastError = "Restore failed";
  for (const t of restored.transactions) {
    const res = await syncTransaction(t);
    if (res.ok) {
      billing = res.data;
      count += 1;
    } else {
      lastError = res.message;
    }
  }
  if (!billing) return { status: "failed", message: lastError };
  return { status: "restored", count, billing };
}

/**
 * Posts every transaction the App Store delivers outside a purchase (renewals,
 * Ask to Buy approvals, purchases made on another device, redelivered
 * unfinished ones) and finishes it after a 2xx. Call once from a mounted,
 * signed-in shell; the returned function stops it. `onBilling` gets the new
 * billing state after each accepted transaction.
 */
export function subscribeAppleTransactionUpdates(
  onBilling?: (billing: AppleBillingState) => void
): () => void {
  const p = plugin();
  if (!p) return () => {};

  let stopped = false;
  const inFlight = new Set<string>();

  const handle = async (t: StoreTransaction) => {
    if (stopped || inFlight.has(t.transactionId)) return;
    inFlight.add(t.transactionId);
    try {
      const res = await syncTransaction(t);
      if (res.ok && !stopped) onBilling?.(res.data);
    } finally {
      inFlight.delete(t.transactionId);
    }
  };

  const drain = async () => {
    const pending = await getPendingStoreTransactions();
    if (pending.status !== "ok") return;
    for (const t of pending.transactions) await handle(t);
  };

  let handle_: ListenerHandle;
  try {
    const added = p.addListener?.("transactionUpdated", (t) => {
      if (isTransaction(t)) void handle(t);
    });
    void Promise.resolve(added)
      .then((h) => {
        handle_ = h;
        if (stopped) void h?.remove?.();
      })
      .catch(() => {});
  } catch {
    // no event support: the drain below and the focus retry still work
  }

  // updates that arrived before the listener existed, and retries of ones the
  // server refused earlier
  void drain();
  const onVisible = () => {
    if (
      typeof document !== "undefined" &&
      document.visibilityState === "visible"
    ) {
      void drain();
    }
  };
  if (typeof document !== "undefined") {
    document.addEventListener?.("visibilitychange", onVisible);
  }

  return () => {
    stopped = true;
    try {
      void handle_?.remove?.();
    } catch {
      // nothing to clean up
    }
    if (typeof document !== "undefined") {
      document.removeEventListener?.("visibilitychange", onVisible);
    }
  };
}
