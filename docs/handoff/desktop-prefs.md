# Settings → Desktop: `UserSettings.prefs` keys

Written by Settings → Desktop (`src/components/needt3/settings/DesktopSections.tsx`),
read by the Mac app through the existing `GET /api/user-settings` (`prefs` map).
Flat keys; every value is a boolean or a string. Defaults live in
`DESKTOP_PREF_DEFAULTS` (`settings/derive.ts`); a missing key means the default.

| Key | Values | Default |
|---|---|---|
| `macLogin` | bool, open at login | true |
| `macKeepRunning` | bool, keep running when the window closes | true |
| `macQuickAddKeys` | modifiers then key, space-separated (`"⌥ Space"`) | `⌥ Space` |
| `macQuickAddPlan` | bool, plan a quick-added task right away | true |
| `macMenuIcon` | `focus` \| `always` \| `off` | `focus` |
| `macDockBadge` | `overdue` \| `off` (off: tray state sends `overdue: 0`, done on the web side in `DesktopBridge`) | `overdue` |
| `islandShow` | bool (Pro; Free is read-only) | true |
| `islandToday` `islandWeek` `islandFocus` | bool, Needt tabs | true |
| `islandMusic` `islandCalendar` `islandShelf` `islandDevices` | bool, More modules | true |
| `islandClipboard` `islandTools` `islandHud` | bool, More modules | false |
| `islandModuleOrder` | comma list of `music,calendar,shelf,clipboard,devices,tools,hud` | that order |
| `islandMomentNow` `islandMomentAirpods` `islandMomentCharging` `islandMomentDone` | bool | true |
| `islandWarning` | `off` \| `2` \| `5` \| `10` (min) | `5` |
| `islandStandby` | `off` \| `15` \| `30` \| `60` (s) | `30` |
| `islandQuietStandby` | bool | true |
| `islandOnPlanQuiet` | bool, show nothing while the day is on plan | true |
| `islandPeek` | `hover` \| `off` | `hover` |
| `islandHoverDelay` | `0.1` \| `0.3` \| `0.6` \| `1` (s) | `0.3` |
| `islandOpenOn` | `click` \| `hover` | `click` |
| `islandDisplays` | `built-in` \| `all` \| `main` | `built-in` |
| `islandPill` `islandHideFullScreen` `islandHaptics` | bool | true |
| `islandSounds` | bool | false |
| `macFocusMode` | `off` \| `dnd` \| `work` \| `personal` | `dnd` |
| `macFocusSuggest` `macMenuTimer` `macLiveActivity` | bool | true |
| `widgetStyle` | `A`–`H` (D = Ink) | `D` |
| `widgetTitlesLocked` | bool, titles when the Mac is locked | false |
| `widgetHabits` | `3` \| `5` \| `all` (Free is held to 3 by the app) | `all` |

The server does not enforce the Free limits on these keys; the Mac app must
(island Pro-only, habits 3).
