# Store release: what the owner does by hand

As of 2026-11-03. Everything that can be done without your Apple and Microsoft
accounts is in the repository; this file lists only what needs you, in order,
with the exact commands. Rules quoted here were checked on 2026-11-03 (links
next to each).

Targets:

| Target                | Bundle / identity                                                         | Store                    |
| --------------------- | ------------------------------------------------------------------------- | ------------------------ |
| iPhone and iPad app   | `app.needt.ios`, widgets `app.needt.ios.widgets`, share `app.needt.ios.share`; iOS 18+ | App Store                |
| Mac app (store build) | `app.needt.mac`, `app.needt.mac.share`, `app.needt.mac.widgets`           | Mac App Store            |
| Windows app           | Partner Center identity (you copy it in step W2)                          | Microsoft Store (MSIX)   |

Your Mac does not have the disk space to archive, so signing and upload run in
GitHub Actions (`.github/workflows/store-upload.yml`) with an App Store Connect
API key. Xcode cloud signing creates the distribution certificate and profiles
itself; you import nothing.

---

## Decisions made (2026-11-03)

1. **Pro is sold inside the iOS app with In-App Purchase.** App Review
   3.1.3(b) lets an app unlock Pro bought on the website only "provided those
   items are also available as in-app purchases within the app"; 3.1.3(f) (no
   IAP needed) covers VoIP, cloud storage, email and web hosting companions,
   not a planner.
   [Guidelines, updated 2026-10-16](https://developer.apple.com/app-store/review/guidelines/).
   - The IAP code is in the repository behind the server flag `apple_iap`,
     which stays off until you submit for review (step 6 says when to turn it
     on).
   - Apple keeps 15 % in the Small Business Program (enrol before the first
     sale, under 1 M USD proceeds a year), otherwise 30 % in a subscription's
     first year and 15 % after.
     [Apple, subscriptions](https://developer.apple.com/help/app-store-connect/manage-subscriptions/offer-auto-renewable-subscriptions).
   - The 14-day refund in Terms §5.5 covers website purchases only; App Store
     purchases are refunded by Apple alone (Terms §5.7).
2. **The Mac App Store gets the build without the notch island.**
   `apps/macos/Island` is a fork of Atoll / boring.notch under GPL v3, and the
   FSF holds that App Store terms conflict with the GPL; VLC was pulled from
   the App Store in 2011 after one contributor complained
   ([FSF 2010](https://www.fsf.org/news/2010-05-app-store-compliance),
   [Engadget 2011](https://www.engadget.com/2011-01-09-the-gpl-the-app-store-and-you.html)).
   store-upload builds the `NeedtAppStoreLite` scheme by default
   (`mac_variant=appstore-lite`), which compiles nothing from `Island/`; CI
   proves it in the `appstore-lite` job of `macos.yml` and again on the
   uploaded archive. The island ships only in the direct download (scheme
   `Needt`, Developer ID, Sparkle). `mac_variant=appstore` still builds the
   store app with the island, for a written exception from the Atoll authors.

## Decision only you can make (before step 1)

1. **Partner Center account type** (individual or company). The operator is a
   sole proprietor; a company account needs business verification.

---

## Apple: one-time setup

### 1. Apple Developer Program

Enrol at <https://developer.apple.com/programs/enroll/> (99 USD a year). Note
the **Team ID** (Membership details, 10 characters).

### 2. Identifiers

<https://developer.apple.com/account/resources/identifiers/list> → `+` → App IDs:

| Identifier               | Capabilities to tick                                         |
| ------------------------ | ------------------------------------------------------------ |
| `app.needt.ios`          | App Groups (`group.app.needt.ios`), Sign in with Apple (only so the key in step 3 can name it; the app carries no entitlement, sign-in is a web flow), In-App Purchase. Push Notifications later, when native push is wired |
| `app.needt.ios.widgets`  | App Groups (`group.app.needt.ios`)                            |
| `app.needt.ios.share`    | App Groups (`group.app.needt.ios`)                            |
| `app.needt.mac`          | App Groups (`<TeamID>.app.needt.mac`), In-App Purchase        |
| `app.needt.mac.share`    | App Groups (`<TeamID>.app.needt.mac`)                         |
| `app.needt.mac.widgets`  | App Groups (`<TeamID>.app.needt.mac`)                         |

Create the iOS App Group `group.app.needt.ios` first (Identifiers → App
Groups). The Mac groups are team-prefixed and need no registration.

### 3. Sign in with Apple and push

- Sign in with Apple: Keys → `+` → Sign in with Apple, primary App ID
  `app.needt.ios`. Download the `.p8` once. In Needt, System Settings →
  Sign-in providers, or Coolify env on `needt`: `APPLE_CLIENT_ID`,
  `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`. Until this is set the
  Apple button says it is not set up, and App Review will reject the build
  (2.1 completeness; 4.8 needs an equivalent login next to Google).
- Push (APNs): Keys → `+` → Apple Push Notifications service. Needed only when
  native push is wired; see apps/ios/README.md.

### 4. App Store Connect API key and GitHub secrets

<https://appstoreconnect.apple.com/access/integrations/api> → Team Keys → `+`,
role **Admin** (cloud signing creates certificates; App Manager cannot).
Download `AuthKey_<KEYID>.p8` (once). Then:

```bash
gh variable set APPLE_TEAM_ID -R teenxgrailed/lumen-41 --body "<TEAM_ID>"
```

```bash
gh secret set ASC_KEY_ID -R teenxgrailed/lumen-41 --body "<KEY_ID>"
```

```bash
gh secret set ASC_ISSUER_ID -R teenxgrailed/lumen-41 --body "<ISSUER_ID>"
```

```bash
gh secret set ASC_KEY_P8 -R teenxgrailed/lumen-41 < ~/Downloads/AuthKey_<KEY_ID>.p8
```

Then delete the `.p8` from Downloads and keep it only in the password manager.

### 5. App records in App Store Connect

<https://appstoreconnect.apple.com/apps> → `+` → New App, twice:

| Field        | iOS                         | Mac                          |
| ------------ | --------------------------- | ---------------------------- |
| Platform     | iOS                         | macOS                        |
| Name         | Needt                       | Needt                        |
| Bundle ID    | `app.needt.ios`             | `app.needt.mac`              |
| SKU          | `needt-ios`                 | `needt-mac`                  |
| User access  | Full                        | Full                         |

Agreements, Tax and Banking: accept the Paid Apps agreement and add bank and
tax details if IAP will be on.

### 6. In-App Purchase products (only if IAP is on)

Monetization → Subscriptions → group "Needt Pro":

| Product ID              | Type                     | Price    |
| ----------------------- | ------------------------ | -------- |
| `app.needt.pro.monthly` | Auto-renewable, 1 month  | 7 USD    |
| `app.needt.pro.yearly`  | Auto-renewable, 1 year   | 59 USD   |
| `app.needt.lifetime`    | Non-consumable           | 149 USD  |

App Information → App Store Server Notifications → Production and Sandbox URL:
`https://use.needt.app/api/billing/apple/notifications`, Version 2.
Coolify env on `needt` and `need-worker`: `APPLE_IAP_ENVIRONMENT=Production`,
`APPLE_IAP_BUNDLE_IDS=app.needt.ios,app.needt.mac`,
`APPLE_IAP_APP_APPLE_ID=<Apple ID of the app record>`, and
`APPLE_IAP_SANDBOX_TESTERS=<your own Needt email>` if you want to test a
Sandbox purchase from TestFlight on production (a Sandbox purchase gives at most
24 h of Pro and never Lifetime; only that list and the reviewer account get it).
With the environment unset the IAP routes answer 503 and the app shows no
purchase. Full reference: `docs/billing/apple-iap.md`.

`/terms` §5.7 describes App Store purchases (Apple is the seller, refunds
only through Apple, cancel in Settings → Apple ID → Subscriptions) and §5.5
says its 14-day refund covers website purchases only. A store build shows §5.7
only while the purchase sheet can sell, so nothing changes in the app until
the flag is on.

**When to turn it on.** Leave the `APPLE_IAP_*` env unset and `apple_iap` off
until the iOS version is ready to submit (step 10). Then, in this order:

1. The three products show **Ready to Submit** and are added to the version
   (the version page → In-App Purchases and Subscriptions). The first IAP
   must go to review together with an app version.
2. Set the `APPLE_IAP_*` env above on `needt` and `need-worker` and redeploy.
3. Turn `apple_iap` on (System Settings → Feature flags) for everyone. The iOS
   app is not public until you release it, so only TestFlight and the reviewer
   see the purchase sheet; the website and the Mac app ignore the flag.
4. In TestFlight, open Pro: the sheet lists the three products with prices.
   If it says the App Store is unavailable, the env or the products are not
   ready; do not submit.
5. Submit (step 10).

Small Business Program: <https://developer.apple.com/app-store/small-business-program/>
before the first sale. IAP is on iOS only; the Mac App Store build has no
StoreKit yet and shows the neutral "This is part of Needt Pro" sheet.

### 7. Reviewer account

Coolify env on `needt` and `need-worker`: `SANDBOX_REVIEWER_EMAIL`,
`SANDBOX_REVIEWER_PASSWORD` (12+ characters), and the `sandbox_accounts` flag
on. The app provisions the account with sample data and resets it nightly.
Enter the same email and password in App Store Connect → the version → App
Review Information → Sign-in required. Never put them in the repository.

---

## Apple: every release

### 8. Build, sign and upload (GitHub Actions)

```bash
gh workflow run store-upload.yml -R teenxgrailed/lumen-41 -f target=ios -f version=1.0.0 -f upload=true
```

```bash
gh workflow run store-upload.yml -R teenxgrailed/lumen-41 -f target=mac -f version=1.0.0 -f upload=true
```

The Mac command builds the store app without the island
(`mac_variant=appstore-lite`, the default).

```bash
gh run watch -R teenxgrailed/lumen-41
```

The build number is the run number, so it only grows. Processing in App Store
Connect takes 10–30 minutes; the build then shows under TestFlight.

Alternative on any Mac with Xcode 26 and ~15 GB free (not yours today):

```bash
cd apps/ios && npm ci && npx cap sync ios
```

```bash
xcodebuild archive -project ios/App/App.xcodeproj -scheme App -configuration Release -destination 'generic/platform=iOS' -archivePath build/Needt.xcarchive DEVELOPMENT_TEAM=<TEAM_ID> -allowProvisioningUpdates
```

```bash
xcodebuild -exportArchive -archivePath build/Needt.xcarchive -exportOptionsPlist ExportOptions-AppStore.plist -exportPath build/export -allowProvisioningUpdates
```

Then upload `build/export/App.ipa` with the Transporter app (Mac App Store), or
set `destination` to `upload` in the plist and the export step uploads itself.

### 9. Metadata, privacy, screenshots

All text is in `apps/ios/store/` and `apps/macos/store/` (README there maps
each file to its App Store Connect field). Paste:

- Name, subtitle, description, keywords, promotional text, support, marketing
  and privacy URL (`https://use.needt.app/privacy`).
- Category Productivity; age rating questionnaire answers from
  `store/age-rating.md` (target 16+). Answers to the new age rating questions
  are required to submit (since 2026-01-31,
  [Apple](https://developer.apple.com/news/upcoming-requirements?id=07242025a)).
- App Privacy: `apps/ios/store/app-privacy.md`, one row per data type.
- Screenshots: artifact `needt-store-screenshots` of the `store-screenshots`
  workflow (iPhone 6.9" 1320x2868, iPad 13" 2064x2752, Mac 2880x1800).
  [Sizes](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications).
- Export compliance: answered by `ITSAppUsesNonExemptEncryption = NO` in the
  build (HTTPS and OS crypto only).
- Review notes: `apps/ios/store/review-notes.md`.

### 10. Submit and release

TestFlight → test the build on your iPhone (sign in with Apple, Google and
email; widgets; offline screen; delete-account flow on a throwaway account).
Then the version page → Add for Review → Submit. Choose "Manually release this
version" so you press Release yourself.

---

## Microsoft Store

### W1. Partner Center

<https://partner.microsoft.com/dashboard/registration> (individual or company,
see decisions). Apps and games → New product → MSIX or PWA app → reserve
"Needt".

### W2. Identity

Product → Product identity: copy `Package/Identity/Name`,
`Package/Identity/Publisher` (`CN=...`) and `PublisherDisplayName`.

```bash
gh variable set MSIX_IDENTITY_NAME -R teenxgrailed/lumen-41 --body "<Name>"
```

```bash
gh variable set MSIX_PUBLISHER -R teenxgrailed/lumen-41 --body "CN=<...>"
```

```bash
gh variable set MSIX_PUBLISHER_DISPLAY_NAME -R teenxgrailed/lumen-41 --body "<display name>"
```

### W3. Build and upload

```bash
gh workflow run desktop.yml -R teenxgrailed/lumen-41
```

Download the artifact `needt-windows-msix`, upload the `.msix` under Packages.
The Store signs MSIX itself; no certificate is needed
([Microsoft](https://learn.microsoft.com/en-us/windows/apps/publish/get-started)).
Listing text, IARC answers and certification notes are in
`apps/desktop/store/listing.md`. Policy 10.8.2: say in the certification notes
that Pro is sold through a third-party payment provider. Screenshots
(≥1366x768) must be taken on a real Windows machine.

---

## What was checked and what was not

As of 2026-11-03, main at the commits named below.

### Checked (evidence)

| Item | Evidence |
| --- | --- |
| iOS Release archive, unsigned, with widgets and Share extension | `ios-archive` on main 89a725c, [run 41585903300](https://github.com/teenxgrailed/lumen-41/actions/runs/41585903300), artifact `needt-ios-archive` |
| iOS `-exportArchive` reads `ExportOptions-AppStore.plist` and stops only at signing | same run: only "No signing certificate" / "No profiles for" errors, asserted by `apps/ios/scripts/check-export-log.sh` |
| iOS privacy manifests valid in App, NeedtWidgets, NeedtShare; no Required Reason symbols in any binary (App, extensions, Capacitor, Cordova) | same run, `plutil -lint` and the `nm -u` scan in `verify-archive.sh` |
| iOS Info.plist: `ITSAppUsesNonExemptEncryption` NO, arm64, usage strings, opaque icons, launch screen | same run, `check-static.sh` and `verify-archive.sh` |
| Mac App Store archive, universal, sandboxed, no Sparkle, no private API, no `Process()` | `macos.yml` on main f890642, [run 41584828840](https://github.com/teenxgrailed/lumen-41/actions/runs/41584828840), artifact `needt-macos-appstore-archive` |
| Mac privacy manifests valid (UserDefaults CA92.1 only), 9 entitlements matched to code, Spotify and Music scripting groups read from their sdef | same run |
| Windows MSIX packs and round-trips (unsigned, placeholder identity) | `desktop.yml` on main 83d2b90, [run 41570506245](https://github.com/teenxgrailed/lumen-41/actions/runs/41570506245), artifact `needt-windows-msix` |
| No price, checkout, upgrade or needt.app link renders in the iOS app or the Mac App Store build | #537: jsdom tests per surface (`store-distribution`, `store-surfaces`, account menu, onboarding) |
| No purchase link in native code | `git grep -iE "pricing|checkout|creem|/upgrade|buy pro"` over `apps/ios/ios`, `apps/macos/Needt`, `apps/shared`: no match |
| Account deletion reachable in the app, also on the demo account | Settings → Account → Delete account (`AccountPage.tsx`, `AccountSection.tsx`), test in #537; demo account may schedule it (#533) |
| Google and Apple sign-in in the system sheet, never a web view | iOS `NeedtAuth` (ASWebAuthenticationSession), Mac `AuthFlow` (system browser + PKCE) |
| iOS app no longer crashes on load in the web view | #554, test `pwa-register-webview.dom.test.ts` |
| Apple IAP server, StoreKit plugin, purchase sheet | #541, #540, #549: unit and DOM tests, two review passes on the money code; flag off |
| Support page | #543, `https://use.needt.app/support` |

### Not checked

- Anything signed: certificates, profiles, entitlements in a signed binary, the
  `store-upload.yml` workflow (needs your secrets), App Store Connect and
  Partner Center validation.
- On a device: offline screen, Share extension, Shortcuts, widgets, sign-in,
  a real or Sandbox purchase, Restore Purchases.
- Mac app on a real Mac (CI compiles it only), notably music control through
  the scripting groups in a signed sandboxed build.
- Windows: installing the MSIX, `needt://` sign-in from the package, behaviour
  without WebView2, notifications under the package identity.
- The age rating App Store Connect computes from the answers in
  `apps/ios/store/age-rating.md` (honest answers give 4+; 16+ is set by
  override because Privacy §13 says Needt is not for anyone under 16).
- Screenshots: see the next section.

### Screenshots

All 28 shots (7 per size: Today, Calendar, Tasks, Page, Habits, Focus,
Widgets) for iPhone 6.9" 1320x2868, iPhone 6.5" 1284x2778, iPad 13" 2064x2752
and Mac 2880x1800 are in artifact `needt-store-screenshots` of
[run 41598850812](https://github.com/teenxgrailed/lumen-41/actions/runs/41598850812)
(artifacts expire; re-run with
`gh workflow run store-screenshots.yml -R teenxgrailed/lumen-41 --ref main`).
The workflow fails if a screen is still loading or two shots in a row match.

Look before uploading:

- Mac `01-today` and `06-focus` show "AI is temporarily unavailable"
  because CI has no AI key. Leave them out or crop the banner.
- iPad: the simulated status bar overlaps the window controls on `03-tasks`.
- Mac `06-focus` differs from `01-today` only by a small timer pill.

### Known risks of rejection

| Risk | Guideline | What is done | What is left |
| --- | --- | --- | --- |
| Web view of the live site | 4.2 | widgets, Live Activity, Controls, Shortcuts, Share extension, native offline screen, system sign-in, alternate icons, haptics; review notes list them | none in code; answer the reviewer with the notes if it comes |
| Pro unlocked by an account bought elsewhere | 3.1.1 / 3.1.3(b) | IAP built, Terms §5.7 | turn it on before submitting (step 6) |
| Sign in with Apple not configured | 4.8, 2.1 | button drawn | step 3 |
| GPL v3 island in the Mac App Store build | licence, not a guideline | store-upload builds the Mac App Store app without the island by default | none |
