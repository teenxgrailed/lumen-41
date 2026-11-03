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
| `review-notes.md`                              | App Review Information > Notes (Part 1 block); Part 2 lists what the server needs. Demo credentials go in the Sign-in fields, never here |   4000 (2705) |
| `../../macos/store/**`                         | Same fields for the Mac app                                                                                                      |              |
| `../../../.github/workflows/store-screenshots.yml` | Screenshots for the version (see below)                                                                                      |              |

`//todo` items that decide whether the listing can ship:

- **Support URL.** `origin/main` has no `/help` or `/support` route under `src/app` (only
  `/privacy`, `/terms`, `/subprocessors`), and `https://needt.app/support` returns 404 as of
  2026-11-03. `support_url.txt` therefore holds `https://needt.app` as a placeholder. Apple
  requires a page with real contact information; a `mailto:` is not accepted. Put a
  contact/help page on the landing site (`support@needt.app` is the address in the legal
  pages) and change both `support_url.txt` files.
- **"Google" in the description** while Google's OAuth verification is open (see
  `review-notes.md` Part 2).
- The five blockers in `review-notes.md` Part 2 (demo deletion, the web paywall inside the
  app, Sign in with Apple keys, Gmail wording, export compliance key).

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
