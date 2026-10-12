import { logger } from "@/lib/logger";

const LOG_SOURCE = "needt3-public-signup";

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Whether public sign-up is open: true / false, or null when the answer could
 * not be had. Unlike the shared `isPublicSignupEnabledClient` (which folds an
 * error into false), an error here stays unknown, so a network blip never
 * tells a stranger that sign-ups are closed.
 */
export async function fetchPublicSignup(): Promise<boolean | null> {
  try {
    const response = await fetch("/api/auth/public-signup", {
      cache: "no-store",
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { enabled?: unknown };
    return typeof data.enabled === "boolean" ? data.enabled : null;
  } catch (e) {
    void logger.warn(
      "Could not read the public sign-up switch",
      { error: message(e) },
      LOG_SOURCE
    );
    return null;
  }
}

/**
 * What the sign-in screens are told about sign-up: only a definite answer
 * decides. Unknown (not asked yet, or the question failed) offers neither
 * "Create one" nor the waitlist line.
 */
export function signupFlags(open: boolean | null): {
  allowSignup: boolean;
  signupClosed: boolean;
} {
  return { allowSignup: open === true, signupClosed: open === false };
}
