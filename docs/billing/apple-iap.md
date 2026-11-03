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
- `enabled` mirrors `apple_iap` for this account.
- `products` is what the paywall may offer:
  - `[]` while `enabled` is false, for an account with a live Creem plan (Pro
    or Lifetime are managed on the web), for an account that already owns
    Lifetime, and for a reviewer sandbox account.
  - Lifetime is left out when the 300 seats are gone. Seats count Creem and
    Apple buyers together: every `Subscription` row at `LIFETIME`, whoever
    sold it, plus open Creem checkout holds.

### `POST /api/billing/apple/transactions` (session, JSON)

Body: `{ "signedTransaction": "<Transaction.jwsRepresentation>" }`. Post after
every purchase, restore and `Transaction.updates` event, then `finish()` the
transaction once the server answered 200.

- Same origin: `Content-Type: application/json`; a request carrying an
  `Origin` header must carry ours (URLSession sends none).
- The JWS chain must end in an Apple root (`src/lib/apple-iap/certs/`), for a
  bundle id in `APPLE_IAP_BUNDLE_IDS`, in `APPLE_IAP_ENVIRONMENT`.
- Its `appAccountToken` must be the caller's (case-insensitive).
- Idempotent: posting the same `originalTransactionId` + `transactionId` again
  changes nothing.
- 200 answers with exactly the `GET /api/billing` body.

| Status | `code`                                          | When                                                    |
| ------ | ----------------------------------------------- | ------------------------------------------------------- |
| 400    | `INVALID_BODY`                                  | `signedTransaction` missing                             |
| 400    | `APPLE_MALFORMED`, `APPLE_INVALID_SIGNATURE`    | not a JWS / signature or chain does not verify          |
| 400    | `APPLE_WRONG_BUNDLE`, `APPLE_WRONG_ENVIRONMENT` | another app / another App Store environment             |
| 400    | `APPLE_UNKNOWN_PRODUCT`                         | a product id not listed above                           |
| 403    | `APPLE_ACCOUNT_MISMATCH`                        | bought under another Needt account's token (or none)    |
| 403    | `SANDBOX_LOCKED`                                | a reviewer sandbox account (`refuseSandbox("billing")`) |
| 403    | `INVALID_ORIGIN`                                | not JSON, or a foreign `Origin`                         |
| 409    | `CREEM_ACTIVE`                                  | the account already pays through Creem                  |
| 409    | `APPLE_TRANSACTION_IN_USE`                      | the purchase is linked to another Needt account         |
| 503    | `APPLE_IAP_OFF`                                 | the flag is off for this account                        |
| 503    | `APPLE_RETRYABLE`, `APPLE_NOT_CONFIGURED`       | Apple's OCSP unreachable / Production without App ID    |

### `POST /api/billing/apple/notifications` (public)

App Store Server Notifications **V2**. Set the same URL for Production and
Sandbox in App Store Connect: `https://use.needt.app/api/billing/apple/notifications`.

- 400: the `signedPayload` (or a transaction / renewal JWS inside it) does not
  verify. 503 when Apple's revocation check could not be reached (Apple
  retries).
- 200 for everything that verified, including payloads that map to no account
  (logged, kept in `AppleNotificationReceipt` with `outcome = "unmapped"`).
  Replays (`notificationUUID` already seen) are answered 200 without applying.
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
| `DID_FAIL_TO_RENEW` (no grace)                                                                        | PRO, PAYMENT_FAILED (Free)                                     |
| `GRACE_PERIOD_EXPIRED`                                                                                | PRO, PAYMENT_FAILED, no end date (Free now)                    |
| `EXPIRED`                                                                                             | PRO, CANCELED, no end date (Free now)                          |
| `REFUND`, `REVOKE`                                                                                    | FREE, CANCELED: removed immediately, Lifetime seat returned    |
| `ONE_TIME_CHARGE`, `REFUND_REVERSED`, `DID_CHANGE_RENEWAL_PREF`, `OFFER_REDEEMED`, `RENEWAL_EXTENDED` | restate the transaction they carry                             |
| `TEST`                                                                                                | logged, nothing stored                                         |
| anything else                                                                                         | ignored (200)                                                  |

A JWS older (`signedDate`) than the newest one applied for the same original
transaction is ignored. An ending event for an older original transaction does
not end a newer one, and a subscription event never replaces an Apple
Lifetime.

### `GET /api/billing`

Gains `source: "creem" | "apple" | null` and `manageUrl` (Apple only:
`https://apps.apple.com/account/subscriptions`; the web shows "Manage in App
Store"). `canManageBilling` (the Creem portal) is false for an Apple plan.

## One seller at a time

- A live Creem plan is never overwritten by Apple (`CREEM_ACTIVE`), and the
  app is told to offer nothing.
- `POST /api/billing/checkout` answers **409 `APPLE_ACTIVE`** (with
  `manageUrl`) while an App Store plan is live, for Pro and Lifetime alike: a
  Creem purchase on top would bill the person twice, and only they can cancel
  the App Store side.
- Account deletion never sends an Apple row to Creem: an App Store
  subscription is cancelled by the buyer in iOS Settings. Deletion logs that
  it left one running.
- Admin comps (`manual-grant`) treat a row with an Apple transaction as paid.

## Environment

| Variable                  | Meaning                                                             |
| ------------------------- | ------------------------------------------------------------------- |
| `APPLE_IAP_ENVIRONMENT`   | `Production` or `Sandbox`. Anything else, or unset, is Sandbox.     |
| `APPLE_IAP_BUNDLE_IDS`    | Comma list; default `app.needt.ios,app.needt.mac`.                  |
| `APPLE_IAP_APP_APPLE_ID`  | Numeric App Apple ID; the library requires it to verify Production. |
| `APPLE_IAP_ALLOW_SANDBOX` | `true` lets a Production server also accept Sandbox-signed data.    |

No secret is needed to verify. Xcode / LocalTesting payloads are unsigned and
can never be configured. Production verification runs Apple's online
revocation (OCSP) checks.

//todo: an App Store Server API key (`.p8`) would let the server look up
subscription status (reconcile a missed notification). Not implemented.

## App Review

App Review signs in with a **real Needt account it creates** (not the
reviewer sandbox account, which refuses billing) and buys with **Apple's
sandbox Apple ID** on its device. Those purchases are Sandbox-signed and reach
the production server, so while a build is in review set
`APPLE_IAP_ALLOW_SANDBOX=true` on production and turn `apple_iap` on for
everyone (or the review account). Sandbox grants are stored with
`Subscription.appleEnvironment = "Sandbox"` so they can be told apart.

## Release notes

- Migration `20261103210000_apple_iap` is additive (nullable columns, a new
  enum and table).
- `@apple/app-store-server-library` is a new dependency: refresh
  `.claude/nm-base` after merge.
- Root certificates: `src/lib/apple-iap/certs/*.cer` from
  https://www.apple.com/certificateauthority/, embedded byte-for-byte in
  `root-certificates.ts`; a unit test pins both to Apple's published SHA-256
  fingerprints.
