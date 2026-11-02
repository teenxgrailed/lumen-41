/**
 * `needt.app/students` sends people to `/auth/signin?plan=student`. The sign-in
 * page turns that into an ordinary callbackUrl, so every path that already
 * carries one (credentials, each OAuth provider's callbackUrl, and the
 * post-auth cookie across an OAuth sign-up, the 16+ step, onboarding and email
 * confirmation) carries the student offer too. Settings then opens on Plan
 * with the offer in view.
 */
export const STUDENT_OFFER_PATH = "/settings?section=billing&offer=student";

export function isStudentPlanParam(plan: string | null | undefined): boolean {
  return plan?.trim().toLowerCase() === "student";
}

/** The callbackUrl the sign-in page should use. An explicit one wins. */
export function signInCallbackFor(
  plan: string | null | undefined,
  callbackUrl: string | null | undefined
): string | undefined {
  if (callbackUrl) return callbackUrl;
  return isStudentPlanParam(plan) ? STUDENT_OFFER_PATH : undefined;
}

/** `?offer=student` on the Settings link. */
export function studentOfferFromSearch(
  search: string | URLSearchParams | null | undefined
): boolean {
  return (
    new URLSearchParams(search ?? "").get("offer")?.trim().toLowerCase() ===
    "student"
  );
}

const KEY = "needt-student-offer";

/** Settings replaces its URL with Today's; the Plan section reads this. */
export function rememberStudentOffer(): void {
  try {
    window.sessionStorage.setItem(KEY, "1");
  } catch {
    // Private mode or blocked storage: the offer is still in Settings, Plan.
  }
}

export function hasStudentOffer(): boolean {
  try {
    return window.sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
