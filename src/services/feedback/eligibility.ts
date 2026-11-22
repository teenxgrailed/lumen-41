/**
 * Who is asked for feedback, when, and which question. Pure: the route reads
 * the rows and hands them in, so every rule is testable without a database.
 *
 * The rules (owner decisions 22.11.26):
 *  - at most one prompt every 14 days per person; a dismissed prompt counts
 *    as shown, so it spaces the next one the same as an answered one;
 *  - only active people: the app used on 5 or more distinct days of the last
 *    14;
 *  - never in the first 7 days of an account, never during onboarding, never
 *    when the person switched prompts off;
 *  - the question rotates through `FEEDBACK_KINDS`: the kind shown longest ago
 *    comes next, one never shown first, ties in list order.
 * "Never twice in one session" is the browser's rule (`feedback-session.ts`):
 * the server has no session to look at.
 */

export const FEEDBACK_KINDS = ["rating", "idea", "annoyance", "nps"] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

export const FEEDBACK_PLATFORMS = ["web", "ios", "mac", "desktop"] as const;
export type FeedbackPlatform = (typeof FEEDBACK_PLATFORMS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;
/** Days between two prompts. */
export const SPACING_DAYS = 14;
/** An account is left alone for this long after sign-up. */
export const GRACE_DAYS = 7;
/** The look-back window for "active", in days. */
export const ACTIVITY_WINDOW_DAYS = 14;
/** Distinct days of use inside the window that make a person active. */
export const ACTIVE_DAYS_REQUIRED = 5;

export interface FeedbackUser {
  /** When the account was made; null for the oldest accounts (no gate). */
  createdAt: Date | null;
  /** `UserSettings.feedbackPrompts`; true when the row does not exist. */
  feedbackPrompts: boolean;
  /** Onboarding is finished (`User.onboardingCompletedAt` is set). */
  onboardingDone: boolean;
}

/** One earlier prompt. Answered, dismissed or ignored, it was shown. */
export interface FeedbackHistoryRow {
  kind: string;
  shownAt: Date;
}

export interface FeedbackActivity {
  /** Distinct UTC days with use in the last `ACTIVITY_WINDOW_DAYS` days. */
  activeDays: number;
}

/** The kind to ask now, or null when nothing should be shown. */
export function nextFeedbackPrompt(
  user: FeedbackUser,
  history: readonly FeedbackHistoryRow[],
  activity: FeedbackActivity,
  now: Date
): FeedbackKind | null {
  if (!user.feedbackPrompts) return null;
  if (!user.onboardingDone) return null;
  if (
    user.createdAt &&
    now.getTime() - user.createdAt.getTime() < GRACE_DAYS * DAY_MS
  )
    return null;
  if (activity.activeDays < ACTIVE_DAYS_REQUIRED) return null;

  const lastShown = new Map<string, number>();
  let latest = -Infinity;
  for (const row of history) {
    const at = row.shownAt.getTime();
    if (at > latest) latest = at;
    if (at > (lastShown.get(row.kind) ?? -Infinity))
      lastShown.set(row.kind, at);
  }
  if (now.getTime() - latest < SPACING_DAYS * DAY_MS) return null;

  // Never shown sorts first (-Infinity); equal times keep the list order.
  let pick: FeedbackKind = FEEDBACK_KINDS[0];
  let pickAt = lastShown.get(pick) ?? -Infinity;
  for (const kind of FEEDBACK_KINDS) {
    const at = lastShown.get(kind) ?? -Infinity;
    if (at < pickAt) {
      pick = kind;
      pickAt = at;
    }
  }
  return pick;
}

/**
 * Whether the answer earns the second step, "Leave a review?": a 5 out of 5
 * or an NPS of 9 or 10. A low answer, or a free-text kind, never does.
 */
export function earnsReviewStep(
  kind: string,
  answer: { rating?: number | null; score?: number | null }
): boolean {
  if (kind === "rating") return answer.rating === 5;
  if (kind === "nps") return (answer.score ?? -1) >= 9;
  return false;
}
