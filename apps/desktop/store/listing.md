# Needt: Microsoft Store listing (en-US)

Paste into Partner Center, Store listings, English (United States). Written
03.11.26 against the Partner Center limits in Microsoft Learn (checked
03.11.26, links in `apps/desktop/README.md`). Brand only: no founder name, no
personal address anywhere in the listing.

## Product

| Field                       | Value                                                                                                           |
| --------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Product name (reserve this) | Needt                                                                                                           |
| Publisher display name      | Needt                                                                                                           |
| Category / subcategory      | Productivity (subcategory: Personal organizer if offered, else leave empty)                                     |
| Privacy policy URL          | https://use.needt.app/privacy                                                                                   |
| Terms (additional license)  | https://use.needt.app/terms (optional field, "License terms")                                                   |
| Website                     | https://needt.app                                                                                               |
| Support contact             | mailto:support@needt.app (`SUPPORT_EMAIL` in `src/lib/legal/operator.ts`; the app has no `/help` page on main)  |
| Copyright and trademark     | (c) 2026 Needt                                                                                                  |
| Languages                   | English (United States) only for now; the manifest declares `en-us`                                             |
| Price                       | Free (the Store does not sell anything; plans are bought on the website, see "Payments" below)                  |

## Short description

(limit 1000, first 270 shown)

```
Tasks, calendar, notes and habits in one place that plans your day around the time you actually have.
```

## Description

(limit 10,000 characters, plain text, no HTML and no URLs)

```
Needt is the place you keep everything you work on and think about.

Your tasks, calendars, pages, habits and focus time live in one app, and Needt plans your day around the time you really have. Connect Google, Outlook or CalDAV calendars, add what needs doing, and Needt finds the slot for each task, moves things when your day changes, and tells you what is next.

The Windows app is the full Needt in its own window, with the extras a browser tab does not give you:

- Quick add from anywhere with Ctrl+Shift+Space, without switching windows
- Desktop notifications for reminders and focus sessions
- A tray menu with today's next tasks and the running focus timer
- Your window size and position remembered between launches
- An offline page instead of a browser error when the connection drops

What you can do with Needt:

- Plan: tasks are scheduled automatically around your calendar, your work hours and your energy
- Write: pages for notes, documents and plans, next to the tasks they belong to
- Build habits: track them and give them time in your week
- Focus: start a focus session on a task and see the time left
- Work with others: share pages and workspaces, comment, and publish a page with a link
- Connect: your data is reachable through Needt's own API, so you can wire it to the tools you already use

Needt needs an internet connection and a Needt account. Sign-in opens your browser, so Google and other providers work the usual way. Needt uses the Microsoft Edge WebView2 Runtime, which is included with Windows 11 and most Windows 10 devices.

Needt has a free plan. Pro and Lifetime plans unlock more and are bought on the Needt website, not in the Store.
```

## Product features

(max 20, each max 200 characters, no bullets)

1. Plans your day automatically around your calendar and work hours
2. Tasks, pages, habits and focus time in one place
3. Quick add from anywhere with Ctrl+Shift+Space
4. Syncs Google, Outlook and CalDAV calendars
5. Tray menu with today's next tasks and the focus timer
6. Desktop notifications for reminders
7. Share pages and workspaces, comment, publish with a link
8. Open API: read and write your data from other tools
9. Sign in with the browser you already use, Google included
10. Offline page and remembered window position

## Search terms

(max 7)

1. planner
2. task manager
3. calendar
4. to do list
5. habit tracker
6. focus timer
7. productivity

## What's new in this version

Leave blank for the first submission. Later: one or two plain sentences from
`CHANGELOG.md` (limit 1500).

## Screenshots

Required: at least 1; recommended 4 to 8. PNG, landscape, at least
1366 x 768 (4K 3840 x 2160 allowed), 50 MB max each, caption up to 200
characters. No extra logos or marketing text on the image; keep key content in
the top two thirds. **None exist yet**; capture them on a real Windows machine
(the Mac cannot show the Windows frame) from the installed app.

| #   | Screen (Windows app window)                         | Caption                                                    |
| --- | --------------------------------------------------- | ---------------------------------------------------------- |
| 1   | Today: tasks placed on the day next to the calendar | Your day, planned around the time you actually have.       |
| 2   | Calendar week with scheduled tasks and events       | Tasks find their slot around your calendars.               |
| 3   | A Page with tasks linked to it                      | Notes and plans next to the work they belong to.           |
| 4   | Quick add card over another app (Ctrl+Shift+Space)  | Add a task from anywhere without leaving what you are doing. |
| 5   | Habits with this week filled in                     | Habits get time in your week.                              |
| 6   | Tray menu with the next tasks and a running focus   | The next task and the focus timer, one click away.         |

Use a demo workspace with neutral sample data (not a real account, no real
names or mail).

Store logos: **1:1 App tile icon 300 x 300 PNG** (strongly recommended; else the
Store takes the package icon). Poster art 720 x 1080 and box art 1080 x 1080 are
for games only; skip. Optional 16:9 hero art 1920 x 1080 without text or UI.

## Age rating (IARC questionnaire)

Partner Center, Age ratings. Answers as of 03.11.26, from what Needt does. The
questionnaire's exact wording was not visible without a Partner Center login;
adjust the labels, not the facts.

| Question                                                      | Answer                                                                                                                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Category                                                      | Productivity / utility / reference (not a game, not a social network)                                                                                        |
| Violence, blood, fear, sexual content, nudity                 | None                                                                                                                                                         |
| Profanity or crude humor                                      | None provided by Needt. People can type anything into their own notes                                                                                        |
| Drugs, alcohol, tobacco; gambling                             | None                                                                                                                                                         |
| Do users interact with each other?                            | **Yes.** Workspaces can be shared with other people, who can edit and comment                                                                                |
| Is user-generated content shared with other users?            | **Yes.** Pages can be shared and published with a public link. Needt does not moderate it in advance. Answer "yes, unmoderated" unless a moderation process exists by launch (not checked in the code) |
| Is personal information shared with other users or third parties? | **Yes.** Collaborators see each other's name and email in a shared workspace                                                                             |
| Is the user's location shared?                                | No (the app does not read device location)                                                                                                                   |
| Unrestricted internet or web browsing?                        | No. Only needt.app and its subdomains load in the app; every other link opens in the user's default browser                                                  |
| Digital purchases                                             | **Yes.** Pro and Lifetime plans are bought on the website through a third-party payment provider; nothing is sold through the Store API                      |

Unverified guess: a low rating with an "online interactions / user-generated
content" descriptor, possibly higher in some regions. Do not answer "no" to
avoid it: the answers must be accurate (Microsoft Learn, age ratings) and go to
IARC together with the publisher display name and email.

## Payments (Store policy 10.8)

Non-game apps may sell digital goods through "a secure third-party purchase
API" instead of the Store's (10.8.1), and may bill subscriptions through a
third party (10.8.6). The condition: "You must note the use of a secure
third-party purchase API in Partner Center during the submission process"
(10.8.2). So in **Notes for certification** write:

```
Needt is free to use. Optional Pro and Lifetime plans are bought on the Needt
website through a secure third-party payment provider (Creem), as allowed for
non-game products by Microsoft Store Policy 10.8.1 and 10.8.6. No purchase is
made inside the Store package. Test account for review: <owner adds a reviewer
login here>.
```

The reviewer account is the owner's to provide (the app's sandbox/reviewer
accounts are provisioned from environment, see `docs/sandbox-accounts.md`).
Never put a real password in a commit.

## Package declarations

- Capabilities: `internetClient`; restricted `runFullTrust` (the app is a Win32
  process in the MSIX). Partner Center asks for a justification: "Needt is a
  desktop app (Tauri, Win32) that runs as a full-trust process and loads its
  interface in the system WebView2 control."
- Architectures: x64 only for now (the CI package is x64). Arm64 runs it under
  emulation on Windows 11 on Arm.
- Updates: the Store updates the package. The app has no self-updater
  (`tauri-plugin-updater` is not a dependency), so nothing needs turning off.
