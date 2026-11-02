/**
 * Connections' words the prototype never had to say, because every connector
 * in it works. One place, so the screen, the phone and the tests agree.
 */
export const strings = {
  /** Normal people: nothing they can do about it. */
  notAvailable: (name: string) => `${name} isn't available yet.`,
  /** The admin: what to add. */
  adminNeeds: (name: string, requires: string) =>
    `${name} needs ${requires}. Add it, then try again.`,

  // Needt API tile
  apiTitle: "Needt API",
  apiLead:
    "Read and write your Needt data from scripts and other tools with a personal access token.",
  apiMcpUrl: "MCP server URL",
  apiDocs: "Connector API docs",

  // Google Tasks: the lists to import
  tasksTitle: "Google Tasks lists",
  tasksLead:
    "Pick the lists to bring into Needt. Title, notes, due date and done state follow Google; dates, priority and scheduling you set in Needt stay yours. Nothing is written back to Google.",
  tasksProject: "Import into",
  tasksProjectLabel: "Project to import into",
  tasksLoading: "Loading your lists…",
  tasksNoLists: "No task lists in this Google account yet.",
  tasksNoProjects: "Create a project first, then pick the lists to import.",
  tasksReauth:
    "Google Tasks needs to be reconnected before Needt can read your lists.",
  tasksReconnect: "Reconnect",
  tasksFailed: "Could not load your Google task lists.",
  tasksRetry: "Try again",
  tasksDone: "Done",
  tasksImported: (name: string) => `${name} imported`,
  tasksStopped: (name: string) => `${name} no longer imported`,
  tasksSummary: (n: number) =>
    n === 0
      ? "No list is imported yet."
      : `${n} ${n === 1 ? "list is" : "lists are"} imported.`,
  tasksSynced: "Google Tasks synced",
  // Where Google sent the person back from (?googleTasks=…)
  tasksDenied: "Google Tasks was not connected: access was not given.",
  tasksScopeMissing:
    "Google Tasks was not connected: allow Needt to see and edit your tasks on the Google screen, then try again.",
  tasksConnectFailed: "Could not connect Google Tasks. Try again.",

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
