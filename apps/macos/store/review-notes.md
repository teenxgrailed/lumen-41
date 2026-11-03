# App Review notes, Needt for Mac (Mac App Store build `NeedtAppStore`)

Same structure as `apps/ios/store/review-notes.md`: Part 1 is pasted into App Store
Connect > App Review Information > Notes (no credentials, ever), Part 2 is ours. The server
prerequisites (`SANDBOX_REVIEWER_EMAIL`, `SANDBOX_REVIEWER_PASSWORD`, the `sandbox_accounts`
flag, the nightly reset) and the "still open before submitting" items in Part 2 of the iOS
file (Sign in with Apple, Google wording, support page) apply here unchanged; read them
before submitting. One account serves both apps.

## Part 1: paste into "Notes"

```
Needt is a planner: tasks, calendar, documents (Pages), habits and a focus timer in one account, the same on Mac, iPhone, iPad and web. The Mac app is a native AppKit/SwiftUI app that hosts our service in a WKWebView, with native menu bar, Quick add, Share extension, App Intents, widgets and an offline screen.

SIGN IN
On the first window choose Continue. Sign-in opens the system default browser on our sign-in page (so Google and Apple sign-in work) and returns to the app through a needt:// link; the window then loads Today. You can sign in with Apple, Google or email.

DEMO ACCESS
A reviewer account is provisioned by the app; credentials are entered in App Store Connect > App Review Information. Sign in with email and password on the sign-in page. It is a Pro account filled with sample tasks, events, pages and habits, and it resets every night (04:00 UTC).

DISABLED ON THE SHARED DEMO ACCOUNT
It cannot change email, password or name; export data; connect a calendar, mail or any other service (you will see "This is a sandbox account that resets nightly: it cannot connect calendars, mail or other services."); set webhooks; create API tokens; invite members; share pages publicly; upload files to pages (task attachments are capped at 1 MB); or send email. The built-in assistant is limited to 15 actions a day. To see these features, create your own account (any email, or Sign in with Apple).

ACCOUNT DELETION
Settings (Command-comma) > Account > Delete account. It works on the demo account; the deletion is scheduled with a 7-day grace period (cancel it in the same place) and the demo account is restored at the nightly reset. To see a real deletion end to end, create an account with any email or Sign in with Apple.

NO PURCHASES IN THE APP
Needt is a free stand-alone companion to our web service (guideline 3.1.3(f)). Pro is unlocked by the account alone. The app contains no purchase, no price and no link to buy.

WHAT TO LOOK AT
1. Today: tasks and calendar events on one timeline. Add a task, finish it.
2. Menu bar: the n icon shows today's open tasks, the next three, Quick add, and Start focus on next task. While a focus runs, the icon shows the countdown.
3. Quick add: press Shift-Command-Space from any app; a small panel adds a task.
4. Share extension: in Safari, Share > Needt turns the page into a task.
5. Siri, Shortcuts and Spotlight: the Shortcuts app lists Needt actions (Add task, Complete task, Start focus, End focus, What is today, What is next, Replan day, Log habit). Open tasks are indexed in Spotlight.
6. Widgets: Edit Widgets > Needt. Today, Next event, Focus timer, Habits, Quick add; each has styles in its Edit menu. Sign in to the app first.
7. Dock badge: the number of overdue tasks.
8. Offline: turn Wi-Fi off. A native screen shows the last day and task list read-only with "Offline" and the time of the last update, and retries on its own.

PRIVACY
No ads, no analytics, no tracking. Policy: https://use.needt.app/privacy. The minimum age is 16 (section 13); the age rating uses the "higher age rating" override. The app is sandboxed and asks only for network access, user-selected files (read-only), and camera and microphone for the web page when a feature asks for them.
```

## Part 2

- **Purchases.** The "NO PURCHASES IN THE APP" paragraph is true on `origin/main` as of
  2026-11-03: the Mac App Store build sets `distribution: "appstore"` and store mode (#537)
  renders no price, checkout or link to buy. In-App Purchase for the Mac build is not built
  (#541 says "later"); the StoreKit plugin (#540) is in the iOS app only. When it is, use the
  same paragraph as `apps/ios/store/review-notes.md` ("PURCHASES"), with Settings > Plan
  for Restore Purchases. Until then do not use it. The Mac store build relies on the native
  shell injecting `distribution: "appstore"` before the page runs (#537, known gap): see the
  window carry it on the first launch before submitting.
- The Mac store build excludes Sparkle and part of the notch island (`apps/macos/README.md`,
  "Mac App Store"). The island is Pro-only and off unless switched on in Settings; do not
  describe it in the listing or the notes until the store build's island behaviour has been
  seen on a real Mac.
- Sign-in uses `NSWorkspace.open` and the default browser, not `ASWebAuthenticationSession`
  (`apps/macos/Needt/Sources/AuthFlow.swift`). Guideline 4.8 is met by offering Sign in with
  Apple on that page; see item 3 in the iOS file.
- Camera and microphone entitlements are there "for the page"; Part 1 says so because Review
  reads entitlements. If no web feature uses them, remove them from the entitlements instead
  of explaining them.
- Everything native in this build has so far been built in CI only; nobody has run it on a
  real Mac (`apps/macos/README.md`, "What needs the owner").
