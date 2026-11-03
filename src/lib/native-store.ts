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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Runs the system purchase sheet. Never rejects. */
export async function purchaseStoreProduct(
  id: string,
  appAccountToken: string
): Promise<StorePurchaseResult | { status: "unavailable" }> {
  const p = plugin();
  if (!p?.purchase) return { status: "unavailable" };
  // without the account token the server can never match the purchase
  if (!UUID_RE.test(appAccountToken ?? "")) {
    return { status: "failed", message: "Missing account token" };
  }
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

/** What the server (or the network) said when it did not answer 2xx. */
export interface AppleServerError {
  /** HTTP status; absent for a network error. */
  status?: number;
  /** The server's machine code ("CREEM_ACTIVE", "APPLE_IAP_OFF", ...). */
  code?: string;
  message: string;
  manageUrl?: string;
}

type ServerResult<T> =
  | { ok: true; data: T }
  | ({ ok: false } & AppleServerError);

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
      | (T & { error?: unknown; code?: unknown; manageUrl?: unknown })
      | null;
    if (!res.ok) {
      return {
        ok: false,
        status: res.status,
        code: typeof body?.code === "string" ? body.code : undefined,
        message:
          typeof body?.error === "string"
            ? body.error
            : `Request failed (${res.status})`,
        manageUrl:
          typeof body?.manageUrl === "string" ? body.manageUrl : undefined,
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

/**
 * Refusals the server will repeat for ever for this transaction: another Needt
 * account bought it, a Creem plan is live, it is already used by another
 * account, or the product or signature is not ours. The transaction is
 * finished so it is not posted again on every launch (each post counts against
 * the account's rate limit). The entitlement stays in `currentEntitlements`,
 * so a restore still works.
 *
 * Everything else is left unfinished and retried: 401, 429, 5xx, a network
 * error, INVALID_ORIGIN, SANDBOX_LOCKED, APPLE_WRONG_ENVIRONMENT,
 * APPLE_WRONG_BUNDLE, APPLE_IAP_OFF.
 */
const PERMANENT_REFUSALS: ReadonlySet<string> = new Set([
  "403:APPLE_ACCOUNT_MISMATCH",
  "409:CREEM_ACTIVE",
  "409:APPLE_TRANSACTION_IN_USE",
  "400:APPLE_UNKNOWN_PRODUCT",
  "400:APPLE_MALFORMED",
  "400:APPLE_INVALID_SIGNATURE",
]);

export function isPermanentAppleRefusal(
  status: number | undefined,
  code: string | undefined
): boolean {
  return (
    status !== undefined &&
    code !== undefined &&
    PERMANENT_REFUSALS.has(`${status}:${code}`)
  );
}

/** Transaction ids being posted right now, so none is posted twice at once. */
const inFlight = new Set<string>();

/**
 * Post, then finish after a 2xx or a permanent refusal. Resolves `null` when
 * the same transaction is already being posted.
 */
async function syncTransaction(
  t: StoreTransaction
): Promise<ServerResult<AppleBillingState> | null> {
  if (inFlight.has(t.transactionId)) return null;
  inFlight.add(t.transactionId);
  try {
    const res = await serverCall<AppleBillingState>(TRANSACTIONS_PATH, {
      method: "POST",
      body: JSON.stringify({ signedTransaction: t.signedTransaction }),
    });
    if (res.ok || isPermanentAppleRefusal(res.status, res.code)) {
      await finishStoreTransaction(t.transactionId);
    }
    return res;
  } finally {
    inFlight.delete(t.transactionId);
  }
}

// -- orchestration -------------------------------------------------------------

export type AppleFailureReason =
  | "unavailable"
  | "cancelled"
  | "pending"
  | "empty"
  | "failed";

/**
 * A purchase or restore that did not end in a billing state. `status` and
 * `code` come from the server when it refused ("CREEM_ACTIVE" means ask Apple
 * for a refund, "APPLE_IAP_OFF" means try later); both are absent for a native
 * or network failure.
 */
export interface AppleFailure extends AppleServerError {
  ok: false;
  reason: AppleFailureReason;
}

export type BuyWithAppleResult =
  | { ok: true; billing: AppleBillingState }
  | AppleFailure;

function failure(
  reason: AppleFailureReason,
  message: string,
  server?: AppleServerError
): AppleFailure {
  return {
    ok: false,
    reason,
    status: server?.status,
    code: server?.code,
    message,
    manageUrl: server?.manageUrl,
  };
}

/** Minimum gap between two background drains of unfinished transactions. */
export const DRAIN_MIN_INTERVAL_MS = 60_000;

/** Running `subscribeAppleTransactionUpdates` drains; `true` ignores the gap. */
const drainers = new Set<(force: boolean) => void>();

/**
 * Buys `productId` with Apple and returns the resulting billing state.
 * Reason "pending" is Ask to Buy / SCA: the approval arrives later through
 * `subscribeAppleTransactionUpdates`. After the purchase has been posted
 * (accepted or not) running subscriptions drain at once, ignoring their
 * throttle, so a post that failed is retried without waiting.
 */
export async function buyWithApple(
  productId: string
): Promise<BuyWithAppleResult> {
  if (!isAppleStoreAvailable()) {
    return failure("unavailable", "Apple purchases are not available here");
  }

  const token = await serverCall<AccountToken>(ACCOUNT_TOKEN_PATH);
  if (!token.ok) return failure("failed", token.message, token);
  if (!token.data.enabled || !token.data.appAccountToken) {
    return failure("failed", "Apple purchases are not enabled");
  }
  if (
    Array.isArray(token.data.products) &&
    !token.data.products.includes(productId)
  ) {
    return failure("failed", "This product is not for sale");
  }

  const bought = await purchaseStoreProduct(
    productId,
    token.data.appAccountToken
  );
  if (bought.status === "unavailable") {
    return failure("unavailable", "Apple purchases are not available here");
  }
  if (bought.status === "pending") {
    return failure("pending", "Waiting for approval from the App Store");
  }
  if (bought.status === "cancelled") {
    return failure("cancelled", "Purchase cancelled");
  }
  if (bought.status === "failed") {
    return failure("failed", bought.message ?? "Purchase failed");
  }

  const synced = await syncTransaction(bought);
  for (const drain of drainers) drain(true);
  if (!synced) {
    return failure("failed", "This purchase is already being applied");
  }
  if (!synced.ok) return failure("failed", synced.message, synced);
  return { ok: true, billing: synced.data };
}

/**
 * The products the purchase sheet may sell: the server's list
 * (`GET /api/billing/apple/account-token`, `enabled` and non-empty) read
 * through StoreKit, so every price and period shown is the App Store's own.
 * Known products come first in the order monthly, yearly, lifetime. `[]` when
 * Apple purchases are off, unavailable here, or StoreKit knows none of them;
 * the caller then keeps its neutral sheet.
 */
export async function loadAppleOffer(): Promise<StoreProduct[]> {
  if (!isAppleStoreAvailable()) return [];
  const token = await serverCall<AccountToken>(ACCOUNT_TOKEN_PATH);
  if (!token.ok || !token.data.enabled) return [];
  const ids = Array.isArray(token.data.products)
    ? token.data.products.filter((id) => typeof id === "string" && id)
    : [];
  if (ids.length === 0) return [];
  const order = Object.values(APPLE_PRODUCT_IDS) as string[];
  const rank = (id: string) => {
    const i = order.indexOf(id);
    return i === -1 ? order.length : i;
  };
  const products = await getStoreProducts(ids);
  return products
    .filter((p) => ids.includes(p.id) && typeof p.displayPrice === "string")
    .sort((a, b) => rank(a.id) - rank(b.id));
}

export type RestoreApplePurchasesResult =
  | { ok: true; count: number; billing: AppleBillingState }
  | AppleFailure;

/** "Restore purchases": syncs with the App Store and posts every entitlement. */
export async function restoreApplePurchases(): Promise<RestoreApplePurchasesResult> {
  const restored = await restoreStoreTransactions();
  if (restored.status === "unavailable") {
    return failure("unavailable", "Apple purchases are not available here");
  }
  if (restored.status === "cancelled") {
    return failure("cancelled", "Restore cancelled");
  }
  if (restored.status === "failed") return failure("failed", restored.message);
  if (restored.transactions.length === 0) {
    return failure("empty", "No purchases to restore");
  }

  let billing: AppleBillingState | null = null;
  let count = 0;
  let lastError: AppleFailure = failure("failed", "Restore failed");
  for (const t of restored.transactions) {
    const res = await syncTransaction(t);
    if (!res) continue;
    if (res.ok) {
      billing = res.data;
      count += 1;
    } else {
      lastError = failure("failed", res.message, res);
    }
  }
  if (!billing) return lastError;
  return { ok: true, count, billing };
}

/**
 * Posts every transaction the App Store delivers outside a purchase (renewals,
 * Ask to Buy approvals, purchases made on another device) and every one
 * StoreKit still holds unfinished (a purchase whose post failed, survives
 * restarts), then finishes it after a 2xx or a permanent refusal. Unfinished
 * ones are looked up on subscribe, when the app becomes visible and after a
 * purchase, at most once per `DRAIN_MIN_INTERVAL_MS` (a purchase ignores the
 * gap). Call once from a mounted, signed-in shell; the returned function stops
 * it. `onBilling` gets the new billing state after each accepted transaction.
 */
export function subscribeAppleTransactionUpdates(
  onBilling?: (billing: AppleBillingState) => void
): () => void {
  const p = plugin();
  if (!p) return () => {};

  let stopped = false;
  let lastDrain: number | null = null;

  const handle = async (t: StoreTransaction) => {
    if (stopped) return;
    const res = await syncTransaction(t);
    if (res?.ok && !stopped) onBilling?.(res.data);
  };

  const drain = async (force: boolean) => {
    if (stopped) return;
    const now = Date.now();
    if (
      !force &&
      lastDrain !== null &&
      now - lastDrain < DRAIN_MIN_INTERVAL_MS
    ) {
      return;
    }
    lastDrain = now;
    const pending = await getPendingStoreTransactions();
    if (pending.status !== "ok") return;
    for (const t of pending.transactions) await handle(t);
  };
  const requestDrain = (force: boolean) => void drain(force);
  drainers.add(requestDrain);

  let listener: ListenerHandle;
  try {
    const added = p.addListener?.("transactionUpdated", (t) => {
      if (isTransaction(t)) void handle(t);
    });
    void Promise.resolve(added)
      .then((h) => {
        listener = h;
        if (stopped) void h?.remove?.();
      })
      .catch(() => {});
  } catch {
    // no event support: the drains below still work
  }

  void drain(false);
  const onVisible = () => {
    if (
      typeof document !== "undefined" &&
      document.visibilityState === "visible"
    ) {
      void drain(false);
    }
  };
  if (typeof document !== "undefined") {
    document.addEventListener?.("visibilitychange", onVisible);
  }

  return () => {
    stopped = true;
    drainers.delete(requestDrain);
    try {
      void listener?.remove?.();
    } catch {
      // nothing to clean up
    }
    if (typeof document !== "undefined") {
      document.removeEventListener?.("visibilitychange", onVisible);
    }
  };
}
