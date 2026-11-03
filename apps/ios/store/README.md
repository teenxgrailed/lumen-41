# App Store listing for Needt (iPhone, iPad)

Everything App Store Connect asks for that is text, plus the workflow that makes the
screenshots. Nothing here is uploaded automatically; `metadata/` follows the layout
`fastlane deliver` reads (`deliver --metadata_path apps/ios/store/metadata`), so it can be
uploaded later with an App Store Connect API key if the owner wants. Brand only: no founder
name and no address anywhere in this folder.

| File                                           | App Store Connect field                                                                                                          | Limit        |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `metadata/en-US/name.txt`                      | App Information > Name                                                                                                           | 30 (5)       |
| `metadata/en-US/subtitle.txt`                  | App Information > Subtitle                                                                                                       | 30 (30)      |
| `metadata/en-US/description.txt`               | Version > Description                                                                                                            | 4000 (1804) |
| `metadata/en-US/promotional_text.txt`          | Version > Promotional Text                                                                                                       | 170 (145)    |
| `metadata/en-US/keywords.txt`                  | Version > Keywords                                                                                                               | 100 (96)     |
| `metadata/en-US/release_notes.txt`             | Version > What's New (first release: shown on updates)                                                                           |              |
| `metadata/en-US/support_url.txt`               | Version > Support URL                                                                                                            |              |
| `metadata/en-US/marketing_url.txt`             | Version > Marketing URL                                                                                                          |              |
| `metadata/en-US/privacy_url.txt`               | App Information > Privacy Policy URL                                                                                             |              |
| `metadata/primary_category.txt`                | App Information > Primary Category: Productivity                                                                                 |              |
| `metadata/secondary_category.txt`              | App Information > Secondary Category: Business                                                                                   |              |
| `app-privacy.md`                               | App Privacy > Data Types (and the tracking question). Also used by the Mac app                                                   |              |
| `age-rating.md`                                | App Information > Age Ratings (questionnaire answers and the 16+ override). Also used by the Mac app                              |              |
| `review-notes.md`                              | App Review Information > Notes (Part 1 block); Part 2 lists what the server needs. Demo credentials go in the Sign-in fields, never here |   4000 (3042 / 3201) |
| `../../macos/store/**`                         | Same fields for the Mac app                                                                                                      |              |
| `../../../.github/workflows/store-screenshots.yml` | Screenshots for the version (see below)                                                                                      |              |

`//todo` items that decide whether the listing can ship:

- **Support URL.** `support_url.txt` (both apps) is `https://use.needt.app/support`. The page
  is being added in a separate PR and must be live (real contact information; Apple does not
  accept a `mailto:`) before the version is submitted.
- **"Google" in the description** while Google's OAuth verification is open (see
  `review-notes.md` Part 2).
- **iPhone and iPad screenshots are not produced yet.** In the iOS WebView the web app shows its
  global error page. Cause (run 41578997678, 2026-11-03): `TypeError: undefined is not an
  object (evaluating 'navigator.serviceWorker.addEventListener')`, thrown in an effect of
  `src/components/pwa/PWARegister.tsx` (the second `useEffect`, line ~119) because the guard
  `"serviceWorker" in navigator` is true in WKWebView while `navigator.serviceWorker` is
  `undefined`. Same pattern in `useOfflineQueue.ts`, `NotificationSettings.tsx`, `push.ts` and
  `offline-client.ts`. It affects every user of the iOS app, not only CI. Fix in `src/`
  (guard on `navigator.serviceWorker`), then re-run the workflow. Mac (2880x1800) and
  widget shots are good.
- `review-notes.md` Part 2: Sign in with Apple keys, Gmail wording, and which purchase
  paragraph is true (no purchase, or In-App Purchase once #541 and the buy UI have merged).
  Demo deletion (#533), store mode (#537) and the export-compliance key (#539) are on `main`.

## Screenshots

`.github/workflows/store-screenshots.yml`, `workflow_dispatch` only (costs nothing until it
is run). It builds the iOS shell and the Mac app against a throwaway local server with the
sample planner the reviewer account gets (`seedSandboxContent`), signs in the way the other
CI workflows do, and uploads the artifact `needt-store-screenshots`:

| Device class                    | Size (px)  | Source                              |
| ------------------------------- | ---------- | ----------------------------------- |
| iPhone 6.9"                     | 1320x2868  | iPhone 17 Pro Max simulator         |
| iPhone 6.5"                     | 1284x2778  | iPhone 14 Plus simulator            |
| iPad 13"                        | 2064x2752  | iPad Pro 13-inch simulator          |
| Mac                             | 2880x1800  | `Needt.app` CI build, 1440x900 pt window at 2x |

Files are named `<device>_<width>x<height>_<NN>-<screen>.png` (`iphone-69_1320x2868_01-today.png`).
Screens: 01 today, 02 calendar, 03 tasks, 04 page, 05 habits, 06 focus, 07 widgets (the
widget renders of `widgets.yml` set on a plain ground; they are renders, not a Home Screen).
Status bar is overridden to 9:41, full battery. A file with the wrong size fails the run.
The run summary says what each screenshot is and which ones are known to be approximate.
