# Family Controls entitlement request (quit-habit blocker)

As of 2026-11-04. The quit blocker (`habits_quit`, off) needs
`com.apple.developer.family-controls`. Development builds can use it on your own
devices; **distribution (TestFlight, App Store) needs Apple's approval**, and
approval is per bundle id. Nothing has been requested; this is the text for you
to submit.

## Where

Apple Developer, "Request the Family Controls (Distribution) entitlement"
(search "Family Controls distribution" on <https://developer.apple.com/contact/request/>;
the form's URL was not re-checked on this date). Sign in as the Account Holder.

Submit once for each bundle id, same text:

| Bundle id                          | What it is                      |
| ---------------------------------- | ------------------------------- |
| `app.needt.ios`                    | the app                         |
| `app.needt.ios.quit.shield`        | shield configuration extension  |
| `app.needt.ios.quit.shieldaction`  | shield action extension         |
| `app.needt.ios.quit.monitor`       | device activity monitor         |

After approval, tick **Family Controls** on all four App IDs
(Identifiers), regenerate the profiles (Xcode cloud signing does it), then run
`ruby scripts/enable-habits-quit.rb` (see `apps/ios/README.md`).

## Text to submit

> **App:** Needt (app.needt.ios), a planner for tasks, calendar and habits.
>
> **Use case:** user-chosen self-control for habits the user wants to quit
> (for example doomscrolling, a game, a shopping app, a website). In Needt a
> person creates a "quit" habit and, on their own device, picks the apps and
> websites they want to be blocked using the system `FamilyActivityPicker`.
> Needt then shields exactly those items with `ManagedSettingsStore`, optionally
> inside a daily window set by the user (`DeviceActivity`).
>
> **Authorization:** `AuthorizationCenter.requestAuthorization(for: .individual)`
> only. The person authorizes their own device with Face ID / Touch ID. The app
> does not use the child member type, has no parent or guardian role, no
> supervision of another person, and no family sharing features. It is not a
> parental-control app.
>
> **What the shield shows:** the user's own reason for quitting (written by
> them), their clean-streak counter, and a "craving" button that opens Needt to
> a short support screen. A second button closes the shielded app.
>
> **User control:** the user can change the selection, change the window, or
> remove the shield at any time inside Needt, and can revoke Screen Time access
> in iOS Settings. The shield is never applied to anything the user did not pick.
>
> **Data:** the selection is stored as opaque system tokens in the app's App
> Group on the device. Tokens, app names and browsing/usage data are never read
> as identifiable data, never sent to our servers and never used for advertising
> or tracking. The only data shown on the shield (reason, streak) is the user's
> own habit data from their Needt account.
>
> **Extensions:** ShieldConfiguration (renders the shield), ShieldAction
> (handles the two buttons), DeviceActivityMonitor (puts the shield up and down
> on the user's schedule).
>
> **Availability:** the feature is released behind a server flag and enabled
> gradually; it is off for everyone until approved.

## Facts for review

- Plans for distribution: App Store (iOS 18+). Not offered to children; no
  Family Sharing features.
- Contact: the Account Holder on the Apple Developer account.

## What was checked on 2026-11-04 (Apple documentation)

- `AuthorizationCenter.requestAuthorization(for:)` takes a `FamilyControlsMember`;
  `.individual` is authorized by the person themself with Face ID / Touch ID.
- `ShieldConfiguration` initializer and `ManagedSettingsStore.Name` as used in
  `apps/ios/ios/App/NeedtQuit`.
- Extension point identifiers `com.apple.ManagedSettingsUI.shield-configuration-service`,
  `com.apple.ManagedSettings.shield-action-service`,
  `com.apple.deviceactivity.monitor-extension` (Apple developer forum posts, not
  an Apple reference page).

## How the «Тянет» button reaches the app

The design note said a shield action can only return `close`, `defer` or `none`.
Apple's current `ShieldActionResponse` page also lists `openParentalControlsApp`
(**iOS 26.5+**, no URL parameter), so the note is true for iOS 18 to 26.4 and
partly stale after. Implemented (`ShieldActionExtension.swift`):

1. «Тянет» writes the habit id to the App Group (`QuitPendingPanic`).
2. It posts a **local notification** (`UNUserNotificationCenter`, from the
   extension) with `userInfo.url = needt://habits/<id>/panic`, and returns `.close`.
3. The app, when it comes to the front (notification tap or any other way),
   reads the pending id and loads `/habits/<id>/panic`. A `needt://habits/<id>/panic`
   URL is handled the same way in `WidgetBridge.open`.
4. Optional, off: build with `HABITS_QUIT_OPEN_APP` (`--open-app` in the enable
   script, Xcode 26.5+) and iOS 26.5+ returns `.openParentalControlsApp` instead
   of the notification.

Not verified on a device: that an extension's local notification is delivered
(it relies on the app's notification permission, which the app already asks for
push), and that `/habits/<id>/panic` exists on the web side.
