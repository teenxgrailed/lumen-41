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
