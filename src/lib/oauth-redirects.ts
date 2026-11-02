export type CalendarOAuthProvider = "google" | "outlook";

const CALENDAR_OAUTH_CALLBACK_PATHS: Record<
  CalendarOAuthProvider,
  `/${string}`
> = {
  google: "/api/calendar/google",
  outlook: "/api/calendar/outlook",
};

export function buildCalendarOAuthRedirectUrl(
  provider: CalendarOAuthProvider,
  origin = process.env.NEXTAUTH_URL
): string {
  if (!origin) {
    throw new Error("NEXTAUTH_URL is required to build an OAuth redirect URL");
  }

  return `${origin.replace(/\/$/, "")}${CALENDAR_OAUTH_CALLBACK_PATHS[provider]}`;
}

/** The Google Tasks connect has its own callback, apart from the calendar one. */
export const GOOGLE_TASKS_CALLBACK_PATH = "/api/task-sync/google/callback";

export function buildGoogleTasksRedirectUrl(
  origin = process.env.NEXTAUTH_URL
): string {
  if (!origin) {
    throw new Error("NEXTAUTH_URL is required to build an OAuth redirect URL");
  }

  return `${origin.replace(/\/$/, "")}${GOOGLE_TASKS_CALLBACK_PATH}`;
}
