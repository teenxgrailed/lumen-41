/*
 * The Connections setup's storage names, kept apart from the hooks so tests
 * (Playwright included) can import them without pulling React in.
 */

/** `prefs.connectionsSetup`: "skipped" or "done"; it never opens by itself. */
export const SETUP_PREF = "connectionsSetup";
/** The run in progress (+ ":" + user id): step and picks, for the round trip. */
export const SETUP_RUN_KEY = "needt.cnSetupRun";
export const setupRunKey = (userId: string | undefined) =>
  `${SETUP_RUN_KEY}:${userId ?? "anon"}`;
/**
 * This session's own note that the setup was dismissed (+ ":" + user id), in
 * case saving the setting failed: the setup still does not reopen.
 */
export const SETUP_SEEN_SESSION_KEY = "needt.cnSetupSeen";
export const setupSeenKey = (userId: string | undefined) =>
  `${SETUP_SEEN_SESSION_KEY}:${userId ?? "anon"}`;
