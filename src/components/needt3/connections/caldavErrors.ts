import { strings } from "./strings";

/**
 * Turns a failed CalDAV test / connect response into one sentence a person can
 * act on. What the server returns today (src/app/api/calendar/caldav):
 *   401  credentials rejected (classifyCalDAVError, kind "auth")
 *   404  login worked but no calendar was found
 *   502  network / TLS failure (kind "connection")
 *   400  a bad optional path, or missing fields
 *   403  Needt's own calendar limit (its text is already meant for people)
 * A request that never got an answer (offline, DNS) arrives as status 0.
 */
export function explainCalDavFailure(
  status: number,
  serverMessage?: string
): string {
  if (status === 0 || status === 502 || status === 503 || status === 504) {
    return strings.caldavErrNetwork;
  }
  if (status === 401) return strings.caldavErrAuth;
  if (status === 404) return strings.caldavErrNoCalendars;
  return serverMessage?.trim() || strings.caldavFailed;
}
