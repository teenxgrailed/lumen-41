# App Review notes, Needt for iPhone and iPad

Two parts. Part 1 is pasted into App Store Connect, App Review Information, "Notes"
(limit 4000 characters; this block is 3042 characters, 3201 with the In-App Purchase paragraph). It carries **no
credentials**. Part 2 is for us: what the server must have before the review, and what to
check.

## Part 1: paste into "Notes"

```
Needt is a planner: tasks, calendar, documents (Pages), habits and a focus timer in one account, the same on iPhone, iPad, Mac and web. The app is a native shell (Capacitor, WKWebView) around our service, with native widgets, Controls, a Live Activity, App Shortcuts, a Share extension and an offline screen. Needs iOS 18.

SIGN IN
Tap Continue with Apple, Continue with Google or use email. Apple and Google open the system sign-in sheet (ASWebAuthenticationSession) and return to the app.

DEMO ACCESS
A reviewer account is provisioned by the app; credentials are entered in App Store Connect > App Review Information. Sign in with email and password. It is a Pro account filled with sample tasks, events, pages and habits, and it resets every night (04:00 UTC).

DISABLED ON THE SHARED DEMO ACCOUNT
It cannot change email, password or name; export data; connect a calendar, mail or any other service (you will see "This is a sandbox account that resets nightly: it cannot connect calendars, mail or other services."); set webhooks; create API tokens; invite members; share pages publicly; upload files to pages (task attachments are capped at 1 MB); or send email. The built-in assistant is limited to 15 actions a day. To see these features, create your own account (any email, or Sign in with Apple).

ACCOUNT DELETION
Settings > Account > Delete account. It works on the demo account; the deletion is scheduled with a 7-day grace period (cancel it in the same place) and the demo account is restored at the nightly reset. To see a real deletion end to end, create an account with any email or Sign in with Apple.

NO PURCHASES IN THE APP
Needt is a free stand-alone companion to our web service (guideline 3.1.3(f)). Pro is unlocked by the account alone. The app contains no purchase, no price and no link to buy.

WHAT TO LOOK AT
1. Today: tasks and calendar events on one timeline. Add a task, finish it.
2. Pages: open a page, edit, come back.
3. Habits and Focus: tick a habit; start a focus session on a task.
4. Widgets: long-press the Home Screen > Edit > Add Widget > Needt. Today, Next event, Focus timer, Habits, Quick add; each has styles in its Edit menu. Sign in to the app first; the widgets read the signed-in session. On iPad there is an extra-large Today widget.
5. Live Activity: start a focus session; the countdown shows on the Lock Screen and in the Dynamic Island on supported iPhones.
6. Controls (iOS 18): Control Center > add Add task or Start focus.
7. Share extension: in Safari tap Share > Needt; the link becomes a task.
8. Shortcuts app / Siri: Add task, Start focus, What is today (App Shortcuts, no setup).
9. Offline: turn on Airplane Mode and reopen the app; a native screen shows today's list with Try again.
10. Settings > Appearance: app icon choices (alternate icons).

PRIVACY
No ads, no analytics, no tracking, no ATT prompt. Policy: https://use.needt.app/privacy. The minimum age is 16 (section 13); the age rating uses the "higher age rating" override.

The app asks for no device permissions.
```

## Part 2: for us, not for Apple

### Server prerequisites (the demo account does not exist until these are set)

Source: `docs/sandbox-accounts.md`, `src/services/sandbox/sandbox-service.ts`
(`sandboxConfigsFromEnv`), `src/lib/sandbox/policy.ts` at `origin/main`.

| What                                | Value / where                                                                                                                 |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `SANDBOX_REVIEWER_EMAIL`            | The reviewer's sign-in address. Any address; no inbox needed. Set on **both the web app and the worker** (Coolify).          |
| `SANDBOX_REVIEWER_PASSWORD`         | At least 12 characters (`SANDBOX_MIN_PASSWORD_LENGTH`). Both services. Half-set (one of the two) means nothing happens.      |
| `SANDBOX_AI_DAILY_ACTION_CAP`       | Optional. Hosted AI actions per day for sandbox accounts, default 15. The notes above say 15; change both together.           |
| Feature flag `sandbox_accounts`     | Admin > Feature flags, on at 100%. Without it nothing is provisioned.                                                          |
| Create the account                  | Restart the worker, or Admin > Users > **Reset sandbox now**. Provisioning is idempotent; it refuses an address that already belongs to a real user. |
| Nightly reset                       | `account-lifecycle` queue, `sandbox-nightly-reset`, 04:00 UTC. Rewrites the sample planner and revokes OAuth tokens older than 24 h. |

Then enter the same email and password in App Store Connect > App Review Information >
Sign-in required. **Never write them in the repository.** Changing the password env var
signs old sessions out at the next run.

### What the demo account is (so the notes stay true)

Email confirmed, password sign-in, no MFA, an ACTIVE Pro `Subscription` with no payment ids,
banner "Sandbox account — resets nightly", seeded with 8 tasks in 2 projects, 3 events this
week, 2 documents, 2 habits, 1 goal. Capabilities refused with `403 SANDBOX_LOCKED` (the list in
`policy.ts`): `account_identity`, `account_delete`, `account_export`, `billing`, `providers`
(Google / Outlook / CalDAV / IMAP / imports / task sync / integrations), `webhooks`,
`api_tokens`, `invites`, `public_share`, `uploads`, `admin`, `outbound_email`. The "disabled"
paragraph in Part 1 is that list in a reviewer's words.

### Purchase paragraph: two variants

The "NO PURCHASES IN THE APP" paragraph in the block above is true while In-App Purchase is
off. Use it only if the flag `apple_iap` is off and `/api/billing/apple/*` answers
`enabled: false` for the build under review. If Apple IAP is on, replace that paragraph
(and nothing else) with this one:

```
PURCHASES
Needt Pro (monthly, yearly) and Lifetime are sold with In-App Purchase (StoreKit 2), in Settings > Plan. Restore Purchases is in Settings > Plan. The demo account can buy with a Sandbox Apple ID: a Sandbox purchase gives Pro for up to 24 hours and is cleared at the nightly reset. The app has no other way to pay and no link to an outside checkout.
```

Checked on 2026-11-03: `NeedtStore` (StoreKit 2 plugin) and `src/lib/native-store.ts` are on
`origin/main` (#540). The server half (#541, products `app.needt.pro.monthly`,
`app.needt.pro.yearly`, `app.needt.lifetime`, flag `apple_iap`, sandbox purchases allowed
only for the reviewer login and `APPLE_IAP_SANDBOX_TESTERS`) was still open. The plan and
Restore Purchases screens are not on `origin/main` (no `Restore Purchases` string in `src/`),
so the IAP paragraph is not yet true. Before using it: #541 merged and `apple_iap` on,
`APPLE_IAP_ENVIRONMENT` and `APPLE_IAP_BUNDLE_IDS` set, the three products created and
"Ready to Submit" in App Store Connect with the Paid Applications agreement accepted, the
buy and Restore UI merged (store mode, #537, today shows the Plan page read-only with no
buy button), and one purchase tried with a Sandbox Apple ID on a device.

### State of `origin/main` at 2026-11-03 (commit 32deed0)

True now, and the notes rely on it:

- Deleting the demo account is allowed: it schedules the 7-day deletion and the nightly reset
  cancels it (#533). `account_delete` is no longer in the sandbox policy.
- Store mode (#537): in the iOS app and the Mac App Store build no price, checkout, upgrade
  button, Creem link or link to the website is rendered (`isStoreDistribution()` in
  `src/lib/native.ts`). Plan is read-only. Known gaps listed in #537: no neutral line for a
  payment-failed banner; "Unlock X with Pro" tooltips on some locked rows remain (they name
  the feature, no price).
- `ITSAppUsesNonExemptEncryption = false` is in `Info.plist` (#539); the export-compliance
  question no longer appears.
- Offline screen, App Shortcuts (Add task, Start focus, What is today), Share extension and
  minimum iOS 18.0 (#539; `apps/ios/README.md`). Not checked on a device (README says so).

Still open before submitting:

1. **Sign in with Apple.** The button says it is not set up until `APPLE_CLIENT_ID`,
   `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` are set (`apps/ios/README.md`).
   Guideline 4.8 wants an equivalent privacy-preserving login next to Google; it must work in
   the build under review.
2. **Gmail / Google Calendar.** The listing names Google among the calendars. Google's
   verification is not through (privacy.ts section 5, "Gmail availability"); if Google
   Calendar is still limited to testers at submission, take "and Google" out of
   `metadata/en-US/description.txt`.
3. **Support page.** `support_url.txt` is `https://use.needt.app/support`; that page is being
   added in a separate PR. It must be live before submitting.
4. **Screenshots.** See this folder's README: the iPhone and iPad shots depend on a web app
   error in the iOS WebView being fixed.

### Also needed in App Store Connect (not files here)

- Contact first name, last name, phone, email for App Review (personal data, entered by
  the owner in App Store Connect, never in the repository).
- Copyright line, version, build, and the screenshots from the workflow in this folder's README.
