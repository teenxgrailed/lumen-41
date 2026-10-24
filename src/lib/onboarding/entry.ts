import { newDate } from "@/lib/date-utils";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { ONBOARDING_V3 } from "@/lib/feature-flags-keys";
import { prisma } from "@/lib/prisma";

import { ONBOARDING_RESUME_PATH, SETUP_PATH, START_PATH } from "./paths";

export * from "./paths";

/** Which flow this account starts in. Per user: rollout and overrides apply. */
export async function onboardingEntryPath(userId: string): Promise<string> {
  return (await isFeatureEnabled(ONBOARDING_V3, userId))
    ? START_PATH
    : SETUP_PATH;
}

/** Stamps the first finish of either flow; later finishes keep that date. */
export async function markOnboardingComplete(userId: string): Promise<void> {
  await prisma.user.updateMany({
    where: { id: userId, onboardingCompletedAt: null },
    data: { onboardingCompletedAt: newDate() },
  });
}

export type OnboardingSnapshot = {
  completedAt: Date | null;
  /** The older `/setup` marker in `UserSettings.prefs`. */
  prefsOnboarded: boolean;
  /** Anything of the person's own: a task, a habit, a project, a calendar. */
  hasData: boolean;
};

/** Neither flow finished and nothing of their own yet. */
export function isOnboardingPending(s: OnboardingSnapshot): boolean {
  return !s.completedAt && !s.prefsOnboarded && !s.hasData;
}

function prefsSayOnboarded(prefs: unknown): boolean {
  return (
    typeof prefs === "object" &&
    prefs !== null &&
    (prefs as Record<string, unknown>).onboarded === true
  );
}

export async function readOnboardingSnapshot(
  userId: string
): Promise<OnboardingSnapshot | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      onboardingCompletedAt: true,
      userSettings: { select: { prefs: true } },
    },
  });
  if (!user) return null;
  const done = Boolean(user.onboardingCompletedAt);
  const prefsOnboarded = prefsSayOnboarded(user.userSettings?.prefs);
  if (done || prefsOnboarded) {
    return {
      completedAt: user.onboardingCompletedAt,
      prefsOnboarded,
      hasData: true,
    };
  }
  const [task, habit, project, feed] = await Promise.all([
    prisma.task.findFirst({
      where: { userId, isSample: false },
      select: { id: true },
    }),
    prisma.habit.findFirst({
      where: { userId, isSample: false },
      select: { id: true },
    }),
    prisma.project.findFirst({
      where: { userId, isSample: false },
      select: { id: true },
    }),
    prisma.calendarFeed.findFirst({
      where: { userId },
      select: { id: true },
    }),
  ]);
  return {
    completedAt: null,
    prefsOnboarded: false,
    hasData: Boolean(task || habit || project || feed),
  };
}

export type TodayGuard =
  | { kind: "none" }
  | { kind: "redirect"; to: string }
  | { kind: "banner"; href: string };

/**
 * What Today does with a person who never finished onboarding: the first visit
 * is sent to the flow once, every later one gets a banner they can close. Only
 * people the `onboarding_v3` flag is on for are guarded, so turning the flag
 * off restores Today exactly as it was.
 */
export function decideTodayGuard(input: {
  flagOn: boolean;
  snapshot: OnboardingSnapshot | null;
  resumed: boolean;
  dismissed: boolean;
}): TodayGuard {
  if (!input.flagOn || !input.snapshot) return { kind: "none" };
  if (!isOnboardingPending(input.snapshot)) return { kind: "none" };
  if (!input.resumed) {
    return { kind: "redirect", to: `${ONBOARDING_RESUME_PATH}?from=today` };
  }
  if (input.dismissed) return { kind: "none" };
  return { kind: "banner", href: START_PATH };
}

export async function todayOnboardingGuard(
  userId: string,
  cookies: { resumed: boolean; dismissed: boolean }
): Promise<TodayGuard> {
  const flagOn = await isFeatureEnabled(ONBOARDING_V3, userId);
  if (!flagOn) return { kind: "none" };
  const snapshot = await readOnboardingSnapshot(userId);
  return decideTodayGuard({ flagOn, snapshot, ...cookies });
}
