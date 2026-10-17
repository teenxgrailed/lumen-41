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

  // Apple / iCloud (CalDAV) connect dialog
  caldavTitle: "Connect Apple / iCloud",
  caldavLead: "Use an app-specific password, not your Apple ID password.",
  caldavHelp: "Create one under Sign-In and Security at account.apple.com.",
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
  caldavTested: (calendars: number | undefined) =>
    calendars === undefined
      ? "Connection works."
      : `Connection works. ${calendars} ${calendars === 1 ? "calendar" : "calendars"} found.`,
} as const;
