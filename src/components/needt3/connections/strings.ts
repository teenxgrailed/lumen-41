/**
 * Connections' words the prototype never had to say, because every connector
 * in it works. One place, so the screen, the phone and the tests agree.
 */
export const strings = {
  /** Normal people: nothing they can do about it. */
  notAvailable: (name: string) => `${name} is not available yet.`,
  /** The admin: what to add. */
  adminNeeds: (name: string, requires: string) =>
    `${name} needs ${requires}. Add it, then try again.`,

  // Apple / iCloud (CalDAV) connect dialog
  caldavTitle: "Connect Apple / iCloud",
  caldavLead: "Use an app-specific password, not your Apple ID password.",
  caldavServer: "Server",
  caldavUser: "Apple ID",
  caldavUserPlaceholder: "name@icloud.com",
  caldavPassword: "App password",
  caldavPasswordPlaceholder: "xxxx-xxxx-xxxx-xxxx",
  caldavPath: "Path",
  caldavPathPlaceholder: "Optional",
  caldavTest: "Test connection",
  caldavTesting: "Testing…",
  caldavConnect: "Connect",
  caldavConnecting: "Connecting…",
  caldavCancel: "Cancel",
  caldavMissing: "Fill in the server, Apple ID and password.",
  caldavFailed: "Could not reach the CalDAV server.",
  caldavErrAuth:
    "Use an app-specific password, not your Apple ID password. Two-factor authentication must be on for your Apple Account.",
  caldavErrNoCalendars:
    "No calendars found. Check that iCloud Calendar is on for this Apple Account, then try again.",
  caldavErrNetwork:
    "Could not reach iCloud. Check your connection and try again.",

  // Step-by-step guide inside the dialog
  guideTitle: "How to get an app-specific password",
  guideOpen: "Open account.apple.com",
  guideSteps: [
    "Open account.apple.com and sign in with your Apple Account. Two-factor authentication must be on.",
    "In the Sign-In and Security section, select App-Specific Passwords.",
    "Select Generate an app-specific password. If asked for a name, enter Needt, then follow the on-screen steps.",
    "Copy the password. It looks like xxxx-xxxx-xxxx-xxxx.",
    "Paste it into App password below, add your Apple ID, then select Test connection.",
  ],
  guideRevoke:
    "You can revoke the password at any time under App-Specific Passwords. Changing your Apple Account password revokes all of them.",
  guideReads:
    "Needt reads your calendars and their events. It writes to iCloud only when you create, move or delete an event in Needt. It does not read mail, photos or Reminders.",
  guideTroubleTitle: "Not working?",
  guideTrouble: [
    "Wrong password type: your normal Apple ID password is rejected. Use the app-specific one.",
    "Two-factor authentication off: App-Specific Passwords is not available until it is on.",
    "Apple ID: enter the email you sign in to Apple with, even if your iCloud address differs.",
    "Birthdays and Holidays are subscriptions and stay read-only. Shared calendars appear only after you accept the invitation.",
  ],
  guideHelp: "Apple's own guide",
  guideAlt: {
    security:
      "Sketch of the Sign-In and Security section with App-Specific Passwords marked",
    generate:
      "Sketch of the App-Specific Passwords page with Generate an app-specific password marked",
    password: "Sketch of a generated password in the form xxxx-xxxx-xxxx-xxxx",
  },
  caldavTested: (calendars: number | undefined) =>
    calendars === undefined
      ? "Connection works."
      : `Connection works. ${calendars} ${calendars === 1 ? "calendar" : "calendars"} found.`,
} as const;
