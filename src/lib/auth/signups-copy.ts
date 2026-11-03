/**
 * What a closed registration says. Client-safe (no database): the register
 * route returns the website wording, and a store build (iOS app, Mac App
 * Store) swaps it for a line that points nowhere off the app.
 */
export const SIGNUPS_CLOSED_CODE = "SIGNUPS_CLOSED";
export const SIGNUPS_CLOSED_MESSAGE =
  "Registration is closed \u2014 join the waitlist at needt.app";
export const SIGNUPS_CLOSED_STORE_MESSAGE = "Sign-ups are closed right now.";

export function signupsClosedMessage(store: boolean) {
  return store ? SIGNUPS_CLOSED_STORE_MESSAGE : SIGNUPS_CLOSED_MESSAGE;
}
