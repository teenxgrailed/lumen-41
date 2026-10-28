/**
 * Feature flag keys. Client-safe: no Prisma, no `crypto`. The evaluation
 * itself (`isFeatureEnabled`) is server-only and lives in `feature-flags.ts`.
 */

/**
 * The v3 paywall's checkout button. Off unless a FeatureFlag row turns it on:
 * payments stay closed until the legal pages are published and the payment
 * provider's review passes. `GET /api/billing` reports it as `checkoutEnabled`.
 */
export const BILLING_CHECKOUT = "billing_checkout";

/**
 * New accounts. Closed unless a FeatureFlag row says `enabled` with
 * `rolloutPercentage` 100: until launch, existing people keep signing in and
 * everybody else is sent to the waitlist at needt.app. Read anonymously by
 * `areSignupsOpen` in `@/lib/auth/signups`, so per-user rollout and overrides
 * do not apply to it.
 */
export const SIGNUPS_OPEN = "signups_open";

/**
 * Chronotype energy curve in auto-scheduling (`/api/energy/profile`). Off
 * unless a FeatureFlag row turns it on; Pro only on top of that. A person's
 * own energy hours always win over the curve.
 */
export const ENERGY_CURVE = "energy_curve";

/**
 * Focus blocking profiles (`/api/blocking/*`, the `needt_blocking` MCP tools).
 * Off unless a FeatureFlag row turns it on; Pro only on top of that.
 */
export const FOCUS_BLOCKING = "focus_blocking";

/**
 * Where a new account starts: the 18-screen `/start` onboarding when on,
 * first-run `/setup` when off. Off unless a FeatureFlag row turns it on;
 * per-user rollout and overrides apply (`isFeatureEnabled`), so one account
 * can be moved onto it before everybody else. Read for new accounts and by the
 * Today resume guard; people who already finished onboarding are never sent
 * anywhere.
 */
export const ONBOARDING_V3 = "onboarding_v3";

/**
 * Every flag the code reads, with what it does. The admin API lists these and
 * creates the row on the first write, so a flag with no row yet (default off)
 * can still be turned on from `/api/admin/feature-flags/[key]`.
 */
/**
 * App-provisioned sandbox accounts (docs/sandbox-accounts.md): the reviewer
 * account from `SANDBOX_REVIEWER_EMAIL` / `SANDBOX_REVIEWER_PASSWORD` and its
 * nightly reset. Off unless a FeatureFlag row turns it on for everybody (read
 * with `isFeatureEnabledForEveryone`). The lockdown of an account that is
 * already a sandbox never depends on this flag.
 */
export const SANDBOX_ACCOUNTS = "sandbox_accounts";

export const KNOWN_FEATURE_FLAGS: Readonly<Record<string, string>> = {
  [BILLING_CHECKOUT]: "The paywall's checkout button.",
  [SIGNUPS_OPEN]: "New accounts (needs 100% rollout; no per-user overrides).",
  [ENERGY_CURVE]: "Chronotype energy curve in auto-scheduling (Pro).",
  [FOCUS_BLOCKING]: "Focus blocking profiles (Pro).",
  [ONBOARDING_V3]: "New accounts start in /start instead of /setup.",
  [SANDBOX_ACCOUNTS]:
    "Reviewer sandbox account from env, reset nightly (needs 100% rollout).",
};

export const isKnownFeatureFlag = (key: string): boolean =>
  Object.prototype.hasOwnProperty.call(KNOWN_FEATURE_FLAGS, key);
