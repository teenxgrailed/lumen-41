import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { HomeScreen } from "@/components/needt3/home/HomeScreen";
import { OnboardingResumeProvider } from "@/components/needt3/home/OnboardingResumeBanner";

import { getAuthOptions } from "@/lib/auth/auth-options";
import { logger } from "@/lib/logger";
import { sectionMetadata } from "@/lib/needt3/section-titles";
import {
  BANNER_DISMISSED_COOKIE,
  RESUMED_COOKIE,
  type TodayGuard,
  todayOnboardingGuard,
} from "@/lib/onboarding/entry";

const LOG_SOURCE = "TodayPage";

export const metadata = sectionMetadata("today");

export const dynamic = "force-dynamic";

/** Never lets the guard stand between a person and Today. */
async function guardFor(userId: string | undefined): Promise<TodayGuard> {
  if (!userId) return { kind: "none" };
  try {
    const jar = await cookies();
    return await todayOnboardingGuard(userId, {
      resumed: jar.has(RESUMED_COOKIE),
      dismissed: jar.has(BANNER_DISMISSED_COOKIE),
    });
  } catch (error) {
    logger.warn(
      "Onboarding guard skipped",
      { error: error instanceof Error ? error.message : String(error) },
      LOG_SOURCE
    );
    return { kind: "none" };
  }
}

export default async function TodayPage() {
  const session = await getServerSession(await getAuthOptions());
  const guard = await guardFor(session?.user?.id);
  // Once: the resolver leaves a cookie, and the next visit gets the banner.
  if (guard.kind === "redirect") redirect(guard.to);
  return (
    <OnboardingResumeProvider
      href={guard.kind === "banner" ? guard.href : null}
    >
      <HomeScreen />
    </OnboardingResumeProvider>
  );
}
