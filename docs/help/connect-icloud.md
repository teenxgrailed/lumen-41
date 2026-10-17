# Connect Apple / iCloud Calendar

Needt connects to iCloud over CalDAV (server `https://caldav.icloud.com`). You sign in with your Apple ID and an **app-specific password**, never your normal Apple ID password.

## Steps

1. Open [account.apple.com](https://account.apple.com) and sign in with your Apple Account. Two-factor authentication must be on.
2. In the **Sign-In and Security** section, select **App-Specific Passwords**.
3. Select **Generate an app-specific password**. If asked for a name, enter `Needt`, then follow the on-screen steps.
4. Copy the password. It looks like `xxxx-xxxx-xxxx-xxxx`.
5. In Needt, open Connections, choose Apple / iCloud, paste it into **App password**, enter your Apple ID, and select **Test connection**, then **Connect**.

You can revoke the password at any time under **App-Specific Passwords** (the Remove button, or Revoke All). Changing your Apple Account password revokes all of them; Needt then needs a new one.

## What Needt reads

Your calendars and their events. Needt writes to iCloud only when you create, move or delete an event in Needt. It does not read mail, photos or Reminders.

## What syncs

- Your own iCloud calendars: yes.
- Shared calendars: appear after you accept the invitation (not verified against a live account).
- Birthdays and Holidays: subscribed calendars, read-only; Apple does not let you edit them.
- Reminders: not synced by Needt. Apple says reminders upgraded in iOS 13 or later are not compatible with earlier software, and Reminders lists are separate from calendars.

## If it fails

| Message in Needt                                         | Cause                                                                       | Fix                                                |
| -------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------- |
| Use an app-specific password, not your Apple ID password | Normal password used, a revoked or mistyped app password, or two-factor off | Generate a new app-specific password (steps above) |
| No calendars found                                       | Login worked, but no calendar came back                                     | Check iCloud Calendar is on for this Apple Account |
| Could not reach iCloud                                   | Network or TLS problem                                                      | Check your connection, then retry                  |

Apple ID: enter the email you sign in to Apple with, even when your iCloud address (`@icloud.com`) is different.

## Sources (checked 2026-10-16)

- Create and revoke app-specific passwords, two-factor requirement, limit of 25: <https://support.apple.com/en-us/102654>
- Reminders upgrade compatibility: <https://support.apple.com/en-lamr/102457>
- Shared and read-only calendars; subscribed calendars such as Holidays cannot be edited: <https://support.apple.com/guide/calendar/share-icloud-calendars-icl32362/11.0/mac/12.0>
- caldav.icloud.com as the CalDAV server and Apple ID plus app-specific password as the login: third-party docs only (<https://developer.nylas.com/docs/cookbook/calendar/apple-calendar-api/>, <https://busymac.com/docs/busycal/70630-using-busycal-with-icloud>); not stated on an Apple page I could open.

Not verified: the `xxxx-xxxx-xxxx-xxxx` format and the "name it" prompt (Apple's page does not mention either), and anything against a live iCloud account.
