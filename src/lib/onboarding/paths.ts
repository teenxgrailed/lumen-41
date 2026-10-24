/**
 * Onboarding routes and cookies. Client-safe: no Prisma. The per-user flag
 * read lives in `entry.ts`.
 */

/** The five-step first-run setup (`onboarding_v3` off). */
export const SETUP_PATH = "/setup";
/** The 18-screen onboarding on the real planner (`onboarding_v3` on). */
export const START_PATH = "/start";
/**
 * Where a brand-new account is sent before anybody knows which flow it gets:
 * the resolver reads the session and the `onboarding_v3` flag for that user.
 */
export const ONBOARDING_RESUME_PATH = "/api/onboarding/resume";

/** Set by the resolver when Today sent somebody there, so it happens once. */
export const RESUMED_COOKIE = "needt-ob-resumed";
/** Set by Today's onboarding banner when it is closed. */
export const BANNER_DISMISSED_COOKIE = "needt-ob-banner-dismissed";

/** One of the places a new account may be sent; anything else is ignored. */
export function isOnboardingEntry(path: string): boolean {
  return (
    path === SETUP_PATH ||
    path === START_PATH ||
    path === ONBOARDING_RESUME_PATH
  );
}

function isStartPath(path: string): boolean {
  return path === START_PATH || path.startsWith(`${START_PATH}?`);
}

/**
 * Where the resolver sends a signed-in person. A return to `/start` (an OAuth
 * sign-up begun inside it) goes back there whatever the flag says, so the flow
 * that started the sign-up is the one that finishes it.
 */
export function resolveOnboardingTarget(
  entry: string,
  callbackPath: string | null
): string {
  if (callbackPath && isStartPath(callbackPath)) return callbackPath;
  return entry;
}
