export const GOOGLE_SIGN_IN_SCOPES = ["openid", "email", "profile"] as const;

export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/userinfo.email",
] as const;

// Google Tasks has its own consent, separate from the calendar one: the
// dedicated connect flow at /api/task-sync/google/auth asks for it, and only
// when the person connects Google Tasks. The sync is a one-way import Google ->
// Needt (GoogleTaskProvider.supportsWriteBack() is false), so the read-only
// scope is all it needs.
export const GOOGLE_TASKS_SCOPES = [
  "https://www.googleapis.com/auth/tasks.readonly",
] as const;

// People who connected before the narrowing granted the full Tasks scope, which
// includes everything tasks.readonly allows. A grant check accepts either.
export const GOOGLE_TASKS_FULL_SCOPE = "https://www.googleapis.com/auth/tasks";

/** True when the granted scopes let Needt read Google Tasks. */
export function hasGoogleTasksReadAccess(granted: readonly string[]): boolean {
  return GOOGLE_TASKS_SCOPES.every(
    (scope) =>
      granted.includes(scope) || granted.includes(GOOGLE_TASKS_FULL_SCOPE)
  );
}

// What the Google Tasks connect asks for: the Tasks scope, plus the
// non-sensitive email scope the calendar consent already lists, because the
// callback must know which Google account the grant belongs to (the Tasks
// scope alone returns no identity).
export const GOOGLE_TASKS_CONNECT_SCOPES = [
  ...GOOGLE_TASKS_SCOPES,
  "https://www.googleapis.com/auth/userinfo.email",
] as const;
