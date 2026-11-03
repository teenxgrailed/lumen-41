# Apple In-App Purchase (server side)

The iOS app, and later the Mac App Store app, sell Needt Pro and Lifetime
through StoreKit 2. This is the server half: it hands the app an account
token, verifies what Apple signs, and writes the plan into the same
`Subscription` row Creem uses, so every "is this person Pro / Lifetime" check
works unchanged.

Everything is behind the server feature flag **`apple_iap`** (off by default;
per-user rollout and overrides apply). Code: `src/lib/apple-iap/`,
`src/services/billing/apple-iap.ts`, `src/app/api/billing/apple/`.

## Products

| Product id              | Type                         | Plan         |
| ----------------------- | ---------------------------- | ------------ |
| `app.needt.pro.monthly` | Auto-renewable (group "Pro") | Pro, monthly |
| `app.needt.pro.yearly`  | Auto-renewable (same group)  | Pro, yearly  |
| `app.needt.lifetime`    | Non-consumable               | Lifetime     |

## API contract

Every refusal answers `{ "error": "<sentence>", "code": "<CODE>" }`.

### `GET /api/billing/apple/account-token` (session)

```json
{
  "appAccountToken": "<uuid v4>",
  "enabled": true,
  "products": [
    "app.needt.pro.monthly",
    "app.needt.pro.yearly",
    "app.needt.lifetime"
  ]
}
```

- `appAccountToken` is created once per account (`User.appleAppAccountToken`)
  and never changes. Pass it to `Product.purchase(options: [.appAccountToken(uuid)])`.
- `enabled` is `apple_iap` for this account **and** a configured server
  (`APPLE_IAP_ENVIRONMENT` set; Production also needs `APPLE_IAP_APP_APPLE_ID`).
- `products` is what the paywall may offer:
  - `[]` while `enabled` is false, for an account with a live Creem plan
    (managed on the web), for an account that already owns Lifetime (Apple,
    Creem or a comp), and for sandbox accounts other than the App Review login.
  - The App Review login (`sandboxKind = reviewer`) gets the products.
  - Lifetime is left out while an App Store Pro renews (Apple would keep
    billing the subscription after the upgrade), and when the 300 seats are
    gone. Seats count Creem and Apple buyers together: every `Subscription`
    row at `LIFETIME`, whoever sold it, plus open Creem checkout holds.

### `POST /api/billing/apple/transactions` (session, JSON)

Body: `{ "signedTransaction": "<Transaction.jwsRepresentation>" }`. Post after
every purchase, restore and `Transaction.updates` event. `finish()` the
transaction on a 2xx and on the permanent 4xx codes below; retry the 5xx.

- Same origin: `Content-Type: application/json`; a request carrying an
  `Origin` header must carry ours (URLSession sends none).
- The verifier is chosen from the environment the payload names, then that
  verifier checks strictly: chain to an Apple root
  (`src/lib/apple-iap/certs/`), a bundle id in `APPLE_IAP_BUNDLE_IDS`, the
  environment. Xcode / LocalTesting are never accepted.
- Its `appAccountToken` must be the caller's (case-insensitive).
- Idempotent: posting the same `originalTransactionId` + `transactionId` again
  changes nothing, and older `signedDate`s are ignored.
- 200 answers with exactly the `GET /api/billing` body.

| Status | `code`                                       | When                                                            |
| ------ | -------------------------------------------- | --------------------------------------------------------------- |
| 400    | `INVALID_BODY`                               | `signedTransaction` missing                                     |
| 400    | `APPLE_MALFORMED`, `APPLE_INVALID_SIGNATURE` | not a JWS / signature or chain does not verify                  |
| 400    | `APPLE_WRONG_BUNDLE`                         | another app                                                     |
| 400    | `APPLE_WRONG_ENVIRONMENT`                    | another environment, or a Sandbox purchase nobody allowed       |
| 400    | `APPLE_UNKNOWN_PRODUCT`                      | a product id not listed above                                   |
| 403    | `APPLE_ACCOUNT_MISMATCH`                     | bought under another Needt account's token (or none)            |
| 403    | `APPLE_SANDBOX_ONLY`                         | the App Review login posted a Production purchase               |
| 403    | `SANDBOX_LOCKED`                             | any other Needt sandbox account                                 |
| 403    | `INVALID_ORIGIN`                             | not JSON, or a foreign `Origin`                                 |
| 409    | `CREEM_ACTIVE`                               | the account already pays through Creem                          |
| 409    | `APPLE_TRANSACTION_IN_USE`                   | the purchase is linked to another Needt account                 |
| 503    | `APPLE_IAP_OFF`                              | the flag is off for this account                                |
| 503    | `APPLE_NOT_CONFIGURED`                       | `APPLE_IAP_ENVIRONMENT` unset in production, or no App Apple ID |
| 503    | `APPLE_RETRYABLE`                            | Apple's OCSP responder could not be reached                     |

### `POST /api/billing/apple/notifications` (public)

App Store Server Notifications **V2**. Set the same URL for Production and
Sandbox in App Store Connect: `https://use.needt.app/api/billing/apple/notifications`.

- Rate limited per IP (120 a minute); bodies over 64 KB answer 413.
- 400: the `signedPayload` (or a transaction / renewal JWS inside it) does not
  verify. 503 when the server is not configured or Apple's revocation check
  could not be reached (Apple retries).
- 200 for everything that verified, including payloads that map to no account
  (`outcome = "unmapped"`) and Sandbox payloads for accounts that may not use
  the Sandbox (`"sandbox_ignored"`). Each is kept in `AppleNotificationReceipt`.
- The receipt is written as `received` and settled at the end. A delivery that
  fails in between (500) stays `received`, and Apple's retry processes it
  again; only a settled receipt is answered as a replay.
- The account is found by the transaction's `appAccountToken`, else by the
  stored `Subscription.appleOriginalTransactionId`.
- Notifications are applied whatever the flag says, so a purchase made while
  it was on keeps renewing, expiring and refunding correctly.

| Notification                                                                                          | Stored as                                                      |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `SUBSCRIBED`, `DID_RENEW`                                                                             | PRO, ACTIVE, `currentPeriodEnd = expiresDate`                  |
| `DID_CHANGE_RENEWAL_STATUS` / `AUTO_RENEW_DISABLED`                                                   | PRO, CANCELED, `cancelAtPeriodEnd`, paid through `expiresDate` |
| `DID_CHANGE_RENEWAL_STATUS` / `AUTO_RENEW_ENABLED`                                                    | PRO, ACTIVE                                                    |
| `DID_FAIL_TO_RENEW` / `GRACE_PERIOD`                                                                  | PRO, PAST_DUE until `gracePeriodExpiresDate`                   |
| `DID_FAIL_TO_RENEW` (no grace)                                                                        | PRO, PAYMENT_FAILED, no end date (Free now)                    |
| `GRACE_PERIOD_EXPIRED`                                                                                | PRO, PAYMENT_FAILED, no end date (Free now)                    |
| `EXPIRED`                                                                                             | PRO, CANCELED, no end date (Free now)                          |
| `REFUND`, `REVOKE`                                                                                    | FREE, CANCELED: removed immediately, Lifetime seat returned    |
| `ONE_TIME_CHARGE`, `REFUND_REVERSED`, `DID_CHANGE_RENEWAL_PREF`, `OFFER_REDEEMED`, `RENEWAL_EXTENDED` | restate the transaction they carry                             |
| `TEST`                                                                                                | logged, nothing stored                                         |
| anything else                                                                                         | ignored (200)                                                  |

A JWS older (`signedDate`) than the newest one applied for the same original
transaction is ignored. An ending event for an older original transaction does
not end a newer one, and nothing replaces or ends a live Lifetime (Apple,
Creem or a comp) except that Lifetime's own refund.

### `GET /api/billing`

Gains `source: "creem" | "apple" | null` and `manageUrl` (Apple only:
`https://apps.apple.com/account/subscriptions`; the web shows "Manage in App
Store"). `canManageBilling` (the Creem portal) is false for an Apple plan.

Also `alsoBilledBy: { source: "apple", manageUrl, since } | null`: set when a
paid Creem plan was bought while an App Store subscription still renewed (see
below). Settings shows "Your App Store subscription is still billing as well"
with the Manage in App Store button.

## App Store Pro never runs open-ended

For `provider = APPLE`, Pro lasts until `currentPeriodEnd` plus 6 hours,
whatever the stored status (`effectiveSubscriptionPlan`,
`APPLE_PERIOD_SLACK_MS`). Each renewal (notification or device post) moves
the date; a missed EXPIRED, a wrong notification URL or an unmapped account
costs at most 6 hours of free Pro, never Pro forever. Apple Lifetime has no
period and is unaffected.

## Sandbox purchases

A Sandbox purchase costs the buyer nothing, so it is never a real plan.

- A Production server verifies Sandbox-signed data but honours it only for:
  - the App Review login (`User.sandboxKind = reviewer`), which in turn may
    post **only** Sandbox purchases;
  - the emails in `APPLE_IAP_SANDBOX_TESTERS` (the owner's TestFlight tests),
    and only once that address is confirmed (`emailVerified`).
- Every Sandbox grant is time-boxed Pro: CANCELED with
  `currentPeriodEnd = min(expiresDate, now + 24 h)`. A Sandbox Lifetime is a
  day of Pro, never `LIFETIME`, and never counts toward the 300 seats.
- A Sandbox purchase never displaces a live Production App Store plan.
- The nightly sandbox reset deletes the reviewer's Apple rows and
  notification receipts, then restores its comp Pro. Provisioning on every
  worker start restores the comp too and clears the Apple columns, so a
  deploy never leaves the reviewer on an Apple row with no period (Free).
- `Subscription.appleEnvironment` records which environment each grant came
  from.

## One seller at a time

- A live Creem plan is never overwritten by Apple (`CREEM_ACTIVE`), and the
  app is told to offer nothing.
- `POST /api/billing/checkout` answers **409 `APPLE_ACTIVE`** (with
  `manageUrl`) while an App Store plan is live, for Pro and Lifetime alike.
- While an App Store plan is live, Creem webhooks for the Creem subscription
  it replaced (the row's old id, or a cursor the Apple takeover closed) and
  Creem events that grant nothing are skipped (receipt outcome
  `apple_active`), and so are Creem refunds.
- A **new** paid Creem purchase is never dropped, even while an App Store
  plan is live (a checkout opened before the Apple purchase and paid after
  it): a new Creem subscription or a paid Lifetime applies (paid Lifetime is
  always granted). If the App Store subscription still renews, nobody but the
  buyer can cancel it, so the row gets `appleConflictSince`, an error is
  logged for the owner, and `GET /api/billing` shows both (`alsoBilledBy`).
  The flag clears when Apple reports that subscription no longer renews
  (auto-renew off, expired, refunded).
- The first Apple grant over a Creem row closes that Creem subscription's
  cursor and, if it still bills (active or in dunning), cancels it at Creem
  through the pending-cancel helper (the worker retries failures).
- Account deletion never sends an Apple row to Creem: an App Store
  subscription is cancelled by the buyer in the App Store. The deletion screen
  (desktop, phone and browser) says so: "Your App Store subscription keeps
  billing until you cancel it in the App Store.", with a Manage in App Store
  button (`GET /api/account/lifecycle` → `appleSubscription`). It shows for
  every App Store Pro that is not CANCELED, billing retry included (no access,
  but Apple keeps trying to charge), and while `appleConflictSince` is set. A
  Creem cancel still pending from an Apple takeover is finished during
  deletion.
- Admin counts (`admin/overview`) and the MCP trial label use the same
  period-bounded rule for App Store Pro.
- Admin comps (`manual-grant`) treat a row with an Apple transaction as paid.

## Environment

| Variable                    | Meaning                                                                                   |
| --------------------------- | ----------------------------------------------------------------------------------------- |
| `APPLE_IAP_ENVIRONMENT`     | `Production` or `Sandbox`. Unset or a typo: not configured in production, Sandbox in dev. |
| `APPLE_IAP_BUNDLE_IDS`      | Comma list; default `app.needt.ios,app.needt.mac`.                                        |
| `APPLE_IAP_APP_APPLE_ID`    | Numeric App Apple ID; the library requires it to verify Production.                       |
| `APPLE_IAP_SANDBOX_TESTERS` | Comma list of account emails whose Sandbox purchases count (24 h Pro).                    |

No secret is needed to verify. Production verification runs Apple's online
revocation (OCSP) checks.

//todo: an App Store Server API key (`.p8`) would let the server look up
subscription status (reconcile a missed notification). Not implemented; the
6-hour period bound limits what a missed one costs.

## App Review

App Review signs in with the reviewer sandbox account (`docs/sandbox-accounts.md`)
and buys with Apple's sandbox Apple ID. Its purchases are Sandbox-signed, reach
the production server, and are honoured for that account only, as a day of
Pro at most. Turn `apple_iap` on for the reviewer account (a per-user
override) or for everyone.

## Release notes

- Migration `20261103210000_apple_iap` is additive (nullable columns, a new
  enum and table).
- `@apple/app-store-server-library` is a new dependency: refresh
  `.claude/nm-base` after merge.
- Root certificates: `src/lib/apple-iap/certs/*.cer` from
  https://www.apple.com/certificateauthority/, embedded byte-for-byte in
  `root-certificates.ts`; a unit test pins both to Apple's published SHA-256
  fingerprints.
